import { Tile } from "../model/types/tile";

/**
 * Extracts multiple Voronoi cells efficiently by performing a single WebGL read.
 */
export function extractSelectedSprites(
    gl: WebGL2RenderingContext,
    allTiles: Tile[],
    selectedTiles: Tile[]
): Map<Tile, HTMLCanvasElement> {
    if (selectedTiles.length === 0) return new Map();

    // 1. Calculate the bounding box of all selected tiles
    // We add a margin (boxRadius) to ensure we capture the full cell
    const boxRadius = 150;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const t of selectedTiles) {
        minX = Math.min(minX, t.pos.x);
        minY = Math.min(minY, t.pos.y);
        maxX = Math.max(maxX, t.pos.x);
        maxY = Math.max(maxY, t.pos.y);
    }

    // Expand by radius
    minX = Math.floor(minX - boxRadius);
    minY = Math.floor(minY - boxRadius);
    maxX = Math.ceil(maxX + boxRadius);
    maxY = Math.ceil(maxY + boxRadius);

    // Clamp to viewport
    // Assuming viewport starts at 0,0. canvasHeight is passed in.
    // For width, we'd need canvasWidth, but let's assume gl.drawingBufferWidth
    const glWidth = gl.drawingBufferWidth;
    const glHeight = gl.drawingBufferHeight;

    if (minX < 0) minX = 0;
    if (minY < 0) minY = 0;
    if (maxX > glWidth) maxX = glWidth;
    if (maxY > glHeight) maxY = glHeight;

    const width = maxX - minX;
    const height = maxY - minY;

    if (width <= 0 || height <= 0) return new Map();

    // 2. Read pixels from WebGL
    // WebGL reads from bottom-left.
    // Screen coords: (minX, minY) is top-left of the region?
    // Wait, usually screen Y=0 is top. WebGL Y=0 is bottom.
    // So 'minY' in screen coords corresponds to 'height - maxY' in WebGL coords?
    // Let's be careful.
    // Screen space: 0 at top, H at bottom.
    // The region we want is [minY, maxY] in screen Y.
    // In WebGL Y: [H - maxY, H - minY].
    // So logic:
    const glY = glHeight - maxY; // Bottom edge of the read rect

    const pixelData = new Uint8Array(width * height * 4);
    gl.readPixels(minX, glY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

    const results = new Map<Tile, HTMLCanvasElement>();

    // 3. Process each tile
    for (const targetTile of selectedTiles) {
        // Local bounding box for this tile
        const tx = Math.floor(targetTile.pos.x - boxRadius);
        const ty = Math.floor(targetTile.pos.y - boxRadius);
        // We only care about the intersection of the tile's needed box and the read buffer
        // But for simplicity, let's just create a canvas of size (boxRadius*2)
        // and only fill pixels that are valid owners.

        const spriteW = boxRadius * 2;
        const spriteH = boxRadius * 2;

        const spriteCanvas = document.createElement("canvas");
        spriteCanvas.width = spriteW;
        spriteCanvas.height = spriteH;
        const ctx = spriteCanvas.getContext("2d")!;
        const spriteData = ctx.createImageData(spriteW, spriteH);

        // Pre-compute neighbors that are close enough to matter
        // Optimization: checking all 1000 tiles for every pixel is slow.
        // We only check tiles within (dist to target + margin)
        // Actually, just checking all tiles is robust, but let's do a simple bounding box filter
        const relevantNeighbors: Tile[] = [];
        for (const t of allTiles) {
            if (t === targetTile) continue;
            // Quick check: if neighbor is > 2*boxRadius away, it can't possibly own a pixel in our box
            // because the max distance from center to corner is sqrt(2)*boxRadius.
            // Actually, if a neighbor is very far, it definitely doesn't win.
            // A safe heuristic is neighbors within 3-4 * radius.
            if (Math.abs(t.pos.x - targetTile.pos.x) < spriteW &&
                Math.abs(t.pos.y - targetTile.pos.y) < spriteH) {
                relevantNeighbors.push(t);
            }
        }

        // Iterate over the sprite's pixels
        for (let row = 0; row < spriteH; row++) {
            for (let col = 0; col < spriteW; col++) {
                // Screen coordinates of this pixel
                const screenX = tx + col;
                const screenY = ty + row;

                // Check if this pixel is inside our read buffer
                if (screenX < minX || screenX >= maxX || screenY < minY || screenY >= maxY) {
                    continue; // Outside relevant screen area
                }

                // Map screen pixel to our pixelData buffer
                // Buffer origin is (minX, maxY in screen space?? No, minX, glY in WebGL space)
                // Let's rely on standard logic:
                // pixelData is width * height.
                // It represents the rect from (minX, glY) to (minX+width, glY+height) in WebGL coords.
                // The pixel at buffer index (c, r) corresponds to WebGL (minX + c, glY + r).
                // Which is Screen (minX + c, glHeight - (glY + r) - 1).

                // Let's invert:
                // We have screenY.
                // WebGL Y = glHeight - screenY - 1.
                // relative buffer Y = (glHeight - screenY - 1) - glY.
                const bufY = (glHeight - screenY - 1) - glY;
                const bufX = screenX - minX;

                // Safety check
                if (bufX < 0 || bufX >= width || bufY < 0 || bufY >= height) continue;

                const bufIdx = (bufY * width + bufX) * 4;

                // --- VORONOI LOGIC ---
                // Does this pixel belong to targetTile?
                const distToTarget = Math.hypot(screenX - targetTile.pos.x, screenY - targetTile.pos.y);
                let isOwner = true;

                for (const neighbor of relevantNeighbors) {
                    const distToNeighbor = Math.hypot(screenX - neighbor.pos.x, screenY - neighbor.pos.y);
                    if (distToNeighbor < distToTarget) {
                        isOwner = false;
                        break;
                    }
                }

                if (isOwner) {
                    const spriteIdx = (row * spriteW + col) * 4;
                    spriteData.data[spriteIdx] = pixelData[bufIdx];
                    spriteData.data[spriteIdx + 1] = pixelData[bufIdx + 1];
                    spriteData.data[spriteIdx + 2] = pixelData[bufIdx + 2];
                    spriteData.data[spriteIdx + 3] = pixelData[bufIdx + 3];
                }
            }
        }

        ctx.putImageData(spriteData, 0, 0);

        // Set position for absolute positioning on screen
        spriteCanvas.style.position = 'absolute';
        spriteCanvas.style.left = `${tx}px`;
        spriteCanvas.style.top = `${ty}px`;
        spriteCanvas.style.pointerEvents = 'none';

        results.set(targetTile, spriteCanvas);
    }

    return results;
}
