import { Tile } from "../model/types/tile";

/**
 * Extracts multiple Voronoi cells efficiently by performing a single WebGL read.
 */
export const EMPTY = 0;
/**
 * Extracts multiple Voronoi cells efficiently by using a pre-rendered ID map.
 * This avoids O(N*Pixels) CPU checks.
 */
export function extractSpritesFromData(
    visualData: Uint8Array,
    idData: Uint8Array,
    width: number,
    height: number,
    tiles: Tile[],
    scale: number = 1.0
): Map<Tile, HTMLCanvasElement> {
    const results = new Map<Tile, HTMLCanvasElement>();

    // We assumed the ID map encodes the index of the tile in the `tiles` array.
    // R + (G << 8) + (B << 16).
    // Let's create a map from ID to Tile for fast lookup if needed,
    // but here we iterate tiles and look for their pixels.
    // Actually, iterating tiles and finding their pixels in the buffer is O(Tiles * Pixels).
    // That is what we want to avoid if Tiles is large?
    // Wait, the previous approach was O(SelectedTiles * Pixels * Neighbors).
    // Here we can iterate pixels ONCE and assign them to buckets?
    // But we need to create individual canvases.

    // Better approach:
    // For each tile, we know its bounding box.
    // We only scan the bounding box in the ID map.
    // If ID matches, we copy pixel.
    // This is O(Tiles * TileArea), which is roughly O(ScreenArea) total if no overlap.
    // With Voronoi, there is no overlap in ownership.
    // So this is O(ScreenWidth * ScreenHeight). Very fast.

    const idToTileIndex = new Map<number, number>();
    tiles.forEach((_t, i) => idToTileIndex.set(i, i)); // trivial map

    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        // Calculate bounding box
        // The tile size is radius. Voronoi cell can extend a bit further, but not infinite.
        // Heuristic: 2x radius is usually enough, but for safety let's use a generous margin
        // or just use the same logic as before.
        // In the previous code, boxRadius was 150.
        const boxRadius = tile.size * 2.5 + 10;

        // Screen coords of tile center (these are already scaled/transformed if we used captureTiles)
        const cx = tile.pos.x;
        const cy = tile.pos.y;

        let minX = Math.floor(cx - boxRadius);
        let minY = Math.floor(cy - boxRadius);
        let maxX = Math.ceil(cx + boxRadius);
        let maxY = Math.ceil(cy + boxRadius);

        // Clamp to buffer
        if (minX < 0) minX = 0;
        if (minY < 0) minY = 0;
        if (maxX > width) maxX = width;
        if (maxY > height) maxY = height;

        const w = maxX - minX;
        const h = maxY - minY;

        if (w <= 0 || h <= 0) continue;

        // Create canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        // We want the canvas to be exactly the size of the extracted region?
        // Or a fixed size centered on tile?
        // Let's make it the size of the bounding box to minimize waste.
        canvas.width = w;
        canvas.height = h;

        const imgData = ctx.createImageData(w, h);

        // Scan the region
        let hasPixels = false;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const screenX = minX + x;
                const screenY = minY + y;

                // Buffer Y is inverted?
                // The visualData and idData came from gl.readPixels.
                // gl.readPixels returns data starting from bottom-left.
                // So buffer index 0 is (0, 0) in WebGL (bottom-left).
                // Screen (0, 0) is top-left.
                // So ScreenY corresponds to WebGL Y = height - 1 - ScreenY.

                // BUT, wait. In the previous code I did complex logic.
                // Let's assume the data passed in is already oriented or we handle it consistently.
                // Calling gl.readPixels(0, 0, w, h...) gets the whole screen.
                // Buffer index for (screenX, screenY):
                // glY = height - 1 - screenY;
                // idx = (glY * width + screenX) * 4;

                const glY = height - 1 - screenY;
                const srcIdx = (glY * width + screenX) * 4;

                // Check ID
                const r = idData[srcIdx];
                const g = idData[srcIdx + 1];
                const b = idData[srcIdx + 2];
                // Alpha is validity
                const a = idData[srcIdx + 3];

                if (a < 128) continue; // Invalid

                const id = r + (g << 8) + (b << 16);

                if (id === i) {
                    hasPixels = true;
                    // Copy visual pixel
                    const dstIdx = (y * w + x) * 4;
                    imgData.data[dstIdx] = visualData[srcIdx];
                    imgData.data[dstIdx + 1] = visualData[srcIdx + 1];
                    imgData.data[dstIdx + 2] = visualData[srcIdx + 2];
                    imgData.data[dstIdx + 3] = visualData[srcIdx + 3];
                }
            }
        }

        if (hasPixels) {
            ctx.putImageData(imgData, 0, 0);

            canvas.style.position = "absolute";
            canvas.style.left = `${minX}px`;
            canvas.style.top = `${minY}px`;
            canvas.style.pointerEvents = "none";

            results.set(tile, canvas);
        }
    }

    return results;
}

/**
 * Traditional CPU-based extraction for small number of tiles (e.g. connections).
 * Avoids full screen readback overhead.
 */
export function extractSelectedSprites(
    gl: WebGL2RenderingContext,
    allTiles: Tile[],
    selectedTiles: Tile[]
): Map<Tile, HTMLCanvasElement> {
    if (selectedTiles.length === 0) return new Map();

    // 1. Calculate bounding box
    const boxRadius = 150;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const t of selectedTiles) {
        minX = Math.min(minX, t.pos.x);
        minY = Math.min(minY, t.pos.y);
        maxX = Math.max(maxX, t.pos.x);
        maxY = Math.max(maxY, t.pos.y);
    }

    minX = Math.floor(minX - boxRadius);
    minY = Math.floor(minY - boxRadius);
    maxX = Math.ceil(maxX + boxRadius);
    maxY = Math.ceil(maxY + boxRadius);

    const glWidth = gl.drawingBufferWidth;
    const glHeight = gl.drawingBufferHeight;

    if (minX < 0) minX = 0;
    if (minY < 0) minY = 0;
    if (maxX > glWidth) maxX = glWidth;
    if (maxY > glHeight) maxY = glHeight;

    const width = maxX - minX;
    const height = maxY - minY;

    if (width <= 0 || height <= 0) return new Map();

    const glY = glHeight - maxY;
    const pixelData = new Uint8Array(width * height * 4);
    gl.readPixels(minX, glY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

    const results = new Map<Tile, HTMLCanvasElement>();

    for (const targetTile of selectedTiles) {
        const tx = Math.floor(targetTile.pos.x - boxRadius);
        const ty = Math.floor(targetTile.pos.y - boxRadius);

        const spriteW = boxRadius * 2;
        const spriteH = boxRadius * 2;

        const spriteCanvas = document.createElement("canvas");
        spriteCanvas.width = spriteW;
        spriteCanvas.height = spriteH;
        const ctx = spriteCanvas.getContext("2d")!;
        const spriteData = ctx.createImageData(spriteW, spriteH);

        const relevantNeighbors: Tile[] = [];
        for (const t of allTiles) {
            if (t === targetTile) continue;
            if (Math.abs(t.pos.x - targetTile.pos.x) < spriteW &&
                Math.abs(t.pos.y - targetTile.pos.y) < spriteH) {
                relevantNeighbors.push(t);
            }
        }

        for (let row = 0; row < spriteH; row++) {
            for (let col = 0; col < spriteW; col++) {
                const screenX = tx + col;
                const screenY = ty + row;

                if (screenX < minX || screenX >= maxX || screenY < minY || screenY >= maxY) continue;

                const bufY = (glHeight - screenY - 1) - glY;
                const bufX = screenX - minX;

                if (bufX < 0 || bufX >= width || bufY < 0 || bufY >= height) continue;

                const bufIdx = (bufY * width + bufX) * 4;

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
        spriteCanvas.style.position = 'absolute';
        spriteCanvas.style.left = `${tx}px`;
        spriteCanvas.style.top = `${ty}px`;
        spriteCanvas.style.pointerEvents = 'none';

        results.set(targetTile, spriteCanvas);
    }

    return results;
}
