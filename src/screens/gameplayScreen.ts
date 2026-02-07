import { Screen } from "../model/types/screen";
import { ScreenManager } from "./screenManager";
import { VoronoiContext, render } from "../shaders/rendering";
import { extractSelectedSprites } from "../shaders/extraction";
import { GameLevel } from "../model/components/gameLevel";

import { viewport } from "../utils/viewport";
import { palette, PALETTE } from "../utils/constants";
import { Tile } from "../model/types/tile";
import { ColorNumber } from "../model/types/color";
import { stepTiles } from "../physics.ts";
import { tileAt } from "../gameLogic.ts";
import { MosaicSerializer } from "../utils/mosaicSerializer";
import { mosaicEncodings } from "../model/levels/mosaicEncodings";
import { GameTile } from "../model/components/gameTile.ts";

enum GameState {
    PLAYING,
    FALLING,        // Tiles falling through floor
    WAITING_PILES,  // Waiting for user to click piles
    ANIMATING,      // Tiles flying to final positions
    DONE            // Animation complete
}

export class GameplayScreen implements Screen {
    private level!: GameLevel;
    private state: GameState = GameState.PLAYING;

    // Reveal animation state
    private fallingTiles: Tile[] = [];

    private elapsedReveal = 0;
    private revealDone = false;

    private isDragging = false;

    private revealedTiles: Set<Tile> = new Set();

    private activeAnimations: {
        el: HTMLCanvasElement;
        tile?: Tile;
        startX: number;
        startY: number;
        targetX: number;
        targetY: number;
        startTime: number;
        duration: number;
    }[] = [];
    private animationTime = 0;

    // Pre-captured sprites and pile data for reveal
    private pileSpritesByColor: Map<ColorNumber, { canvas: HTMLCanvasElement; tile: Tile; finalPos: { x: number; y: number } }[]> = new Map();
    private pilePositions: { colorID: ColorNumber; x: number; y: number }[] = [];
    private animatedPiles: Set<ColorNumber> = new Set();

    constructor(
        private manager: ScreenManager,
        private glCtx: VoronoiContext,
        private overlay: CanvasRenderingContext2D,
        private levelIndex: number
    ) {
    }

    // ── Lifecycle ──────────────────────────────────────────

    enter() {
        // Fallback or loop if index is out of bounds
        const encodingIndex = this.levelIndex % mosaicEncodings.length;
        const encoding = mosaicEncodings[encodingIndex];

        const mosaic = MosaicSerializer.deserialize(encoding);
        this.level = new GameLevel(mosaic);

        this.state = GameState.PLAYING;
        this.fallingTiles = [];
        this.elapsedReveal = 0;
        this.revealDone = false;
        this.activeAnimations = [];
        this.animationTime = 0;
        this.pileSpritesByColor.clear();
        this.pilePositions = [];
        this.animatedPiles.clear();
        this.revealedTiles.clear();

        this.updateHUD();

        const el = document.getElementById("tile-requirements");
        if (el) el.style.display = "flex";
    }

    exit() {
        const el = document.getElementById("tile-requirements");
        if (el) el.style.display = "none";

        // Cleanup active animations
        for (const anim of this.activeAnimations) {
            anim.el.remove();
        }
        this.activeAnimations = [];

        if (this.revealContainer) {
            this.revealContainer.remove();
            this.revealContainer = null;
        }
    }

    update(dt: number) {
        if (this.state === GameState.PLAYING) {
            stepTiles(this.level.tiles, viewport.width, viewport.height);
            this.updateAnimations(dt);
            if (this.level.isGameWon()) {
                this.startReveal();
            }
        } else if (this.state === GameState.FALLING) {
            this.updateFalling(dt);
        } else if (this.state === GameState.WAITING_PILES || this.state === GameState.ANIMATING) {
            this.updateAnimations(dt);
            // Check if all piles animated and animations done
            if (this.state === GameState.ANIMATING &&
                this.animatedPiles.size === this.pilePositions.length &&
                this.activeAnimations.length === 0) {
                this.state = GameState.DONE;
                this.revealDone = true;
            }
        }
    }

    private updateAnimations(dt: number) {
        this.animationTime += dt;
        const toRemove: number[] = [];

        for (let i = 0; i < this.activeAnimations.length; i++) {
            const anim = this.activeAnimations[i];
            const elapsed = this.animationTime - anim.startTime;

            if (elapsed < 0) continue; // Not started yet (staggered)

            if (elapsed >= anim.duration) {
                // Done
                anim.el.remove();
                if (anim.tile) {
                    this.revealedTiles.add(anim.tile);
                }
                toRemove.push(i);
                continue;
            }

            const t = elapsed / anim.duration;
            // Easing: easeOutCubic
            const ease = 1 - Math.pow(1 - t, 3);

            const currX = anim.startX + (anim.targetX - anim.startX) * ease;
            const currY = anim.startY + (anim.targetY - anim.startY) * ease;

            // Scale effect: start small, grow to full size
            const scale = 0.3 + 0.7 * ease;

            // Adjust for canvas centering
            const halfW = anim.el.width / 2;
            const halfH = anim.el.height / 2;
            const left = parseFloat(anim.el.style.left);
            const top = parseFloat(anim.el.style.top);

            const tx = currX - (left + halfW);
            const ty = currY - (top + halfH);

            anim.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
            anim.el.style.opacity = `${0.5 + 0.5 * ease}`;
        }

        // Remove backwards to avoid index issues
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.activeAnimations.splice(toRemove[i], 1);
        }
    }

    private startReveal() {
        this.state = GameState.FALLING;
        this.elapsedReveal = 0;
        this.revealDone = false;
        palette.addColor({
            gl: [1.0, 1.0, 1.0],
            css: '#ffffff'
        })

        // Cleanup active animations from gameplay
        for (const anim of this.activeAnimations) {
            anim.el.remove();
        }
        this.activeAnimations = [];

        // Convert current tiles to falling tiles (gravity will pull them down)
        this.fallingTiles = [...this.level.tiles];
        // Clear level tiles so physics stops affecting them
        this.level.tiles = [];

        // Set up the reveal: capture sprites and prepare pile data
        this.setupRevealPiles(this.level.completedMosaic.tiles);

        const el = document.getElementById("tile-requirements");
        if (el) el.style.display = "none";
    }

    private setupRevealPiles(targetTiles: Tile[]) {
        // Calculate the actual bounding box of the tiles to ensure robustness
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const t of targetTiles) {
            // Check bounds including radius
            if (t.pos.x - t.size < minX) minX = t.pos.x - t.size;
            if (t.pos.x + t.size > maxX) maxX = t.pos.x + t.size;
            if (t.pos.y - t.size < minY) minY = t.pos.y - t.size;
            if (t.pos.y + t.size > maxY) maxY = t.pos.y + t.size;
        }

        // Add a little breathing room inside the frame
        const internalPadding = 20;
        minX -= internalPadding;
        minY -= internalPadding;
        maxX += internalPadding;
        maxY += internalPadding;

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        // Fit logic
        const padding = 50; // Screen padding
        const availableW = viewport.width - padding * 2;
        const availableH = viewport.height - padding * 2;
        const scale = Math.min(availableW / contentW, availableH / contentH);

        const frameW = contentW * scale;
        const frameH = contentH * scale;
        const frameX = (viewport.width - frameW) / 2;
        const frameY = (viewport.height - frameH) / 2;

        // Store these for drawing the frame later (so we don't recalc)
        // We can attach them to the class or just recalc in drawMosaicFrame using the same logic if we trust it's fast enough.
        // For robustness, let's cache the frame rect.
        this.revealFrameRect = { x: frameX, y: frameY, w: frameW, h: frameH };

        // Create HTML container for clipping flying tiles
        if (!this.revealContainer) {
            this.revealContainer = document.createElement("div");
            this.revealContainer.id = "mosaic-reveal-container";
            document.body.appendChild(this.revealContainer);
        }
        this.revealContainer.style.position = "absolute";
        this.revealContainer.style.left = `${frameX}px`;
        this.revealContainer.style.top = `${frameY}px`;
        this.revealContainer.style.width = `${frameW}px`;
        this.revealContainer.style.height = `${frameH}px`;
        this.revealContainer.style.overflow = "hidden";
        this.revealContainer.style.pointerEvents = "none";
        this.revealContainer.style.zIndex = "1000";

        // Temporarily adjust tile positions to fit in the frame for texturing
        const captureTiles: Tile[] = targetTiles.map(t => {
            const newT = t.clone();
            // Map t.pos from [minX, minY] to [0, 0] then scale and offset to frame
            newT.pos.x = frameX + (t.pos.x - minX) * scale;
            newT.pos.y = frameY + (t.pos.y - minY) * scale;
            newT.size = t.size * scale;
            return newT;
        });

        render(this.glCtx, captureTiles);

        // Extract sprites for all tiles
        const spritesMap = extractSelectedSprites(this.glCtx.gl, captureTiles, captureTiles);

        // Group by color and setup piles
        const byColor = new Map<ColorNumber, Tile[]>();
        for (const t of captureTiles) {
            const arr = byColor.get(t.colorID) ?? [];
            arr.push(t);
            byColor.set(t.colorID, arr);
        }

        const colors = Array.from(byColor.keys());
        const pileY = viewport.height - 80;
        const spacing = viewport.width / (colors.length + 1);

        // Clear previous data
        this.pileSpritesByColor.clear();
        this.pilePositions = [];

        for (let c = 0; c < colors.length; c++) {
            const colorID = colors[c];
            const group = byColor.get(colorID)!;
            const pileX = spacing * (c + 1);

            this.pilePositions.push({ colorID, x: pileX, y: pileY });

            const sprites: { canvas: HTMLCanvasElement; tile: Tile; finalPos: { x: number; y: number } }[] = [];
            for (const tile of group) {
                const canvas = spritesMap.get(tile);
                if (canvas) {
                    sprites.push({ canvas, tile, finalPos: { x: tile.pos.x, y: tile.pos.y } });
                }
            }
            this.pileSpritesByColor.set(colorID, sprites);
        }
    }

    private revealFrameRect: { x: number, y: number, w: number, h: number } | null = null;

    private updateFalling(dt: number) {
        this.elapsedReveal += dt;

        // Apply gravity to falling tiles
        for (const t of this.fallingTiles) {
            t.vel.y += 800 * dt;
            t.pos.x += t.vel.x * dt;
            t.pos.y += t.vel.y * dt;
        }

        // Remove tiles that have fallen off screen
        this.fallingTiles = this.fallingTiles.filter(t => t.pos.y < viewport.height + 200);

        // After 1 second or when all tiles gone, transition to waiting
        if (this.elapsedReveal > 5.0 || this.fallingTiles.length === 0) {
            this.fallingTiles = []; // Clear completely
            this.state = GameState.WAITING_PILES;
        }
    }

    private animatePile(colorID: ColorNumber) {
        if (this.animatedPiles.has(colorID)) return;
        this.animatedPiles.add(colorID);

        const sprites = this.pileSpritesByColor.get(colorID);
        if (!sprites) return;

        const pile = this.pilePositions.find(p => p.colorID === colorID);
        if (!pile) return;

        const delayPerTile = 0.04; // 40ms between tiles
        const animDuration = 0.6;

        // If specific pile logic:
        const container = this.revealContainer;
        if (!container || !this.revealFrameRect) return;
        const { x: frameX, y: frameY } = this.revealFrameRect;

        sprites.forEach((sprite, index) => {
            const canvas = sprite.canvas;

            // Add to container!
            // Dimensions need to be relative to container (which is at frameX, frameY)
            // Pile pos is absolute (screen).
            // Target pos (finalPos) is ABSOLUTE (screen) because setupRevealPiles calculated it as such (scaled and offset).

            // So:
            // startX relative = pile.x - frameX
            // startY relative = pile.y - frameY
            // targetX relative = sprite.finalPos.x - frameX
            // targetY relative = sprite.finalPos.y - frameY

            const startXRel = pile.x - frameX;
            const startYRel = pile.y - frameY;
            const targetXRel = sprite.finalPos.x - frameX;
            const targetYRel = sprite.finalPos.y - frameY;

            canvas.style.position = 'absolute';
            // Start at relative pile pos
            canvas.style.left = `${startXRel - canvas.width / 2}px`;
            canvas.style.top = `${startYRel - canvas.height / 2}px`;
            canvas.style.zIndex = "1000";
            canvas.style.pointerEvents = 'none';
            canvas.style.transform = 'scale(0.3)';
            canvas.style.opacity = '0.5';

            container.appendChild(canvas);

            this.activeAnimations.push({
                el: canvas,
                tile: sprite.tile,
                startX: startXRel,
                startY: startYRel,
                targetX: targetXRel,
                targetY: targetYRel,
                startTime: this.animationTime + index * delayPerTile,
                duration: animDuration
            });
        });

        this.state = GameState.ANIMATING;
    }

    // Get tiles that should be rendered
    // Should contain ALL tiles, but only color ones in animatedPiles
    private getRevealedMosaicTiles(): Tile[] {
        const revealed: Tile[] = [];
        for (const [colorID, sprites] of this.pileSpritesByColor.entries()) {
            if (this.animatedPiles.has(colorID)) {
                for (const sprite of sprites) {
                    if (this.revealedTiles.has(sprite.tile)) {
                        revealed.push(sprite.tile);
                    } else {
                        revealed.push(new GameTile(
                            { x: sprite.finalPos.x, y: sprite.finalPos.y },
                            { x: 0, y: 0 },
                            sprite.tile.size,
                            palette.max - 1
                        ));
                    }
                }
            } else {
                for (const sprite of sprites) {
                    revealed.push(new GameTile(
                        { x: sprite.finalPos.x, y: sprite.finalPos.y },
                        { x: 0, y: 0 },
                        sprite.tile.size,
                        palette.max - 1
                    ));
                }
            }
        }
        return revealed;
    }

    private revealContainer: HTMLDivElement | null = null;

    render() {
        this.overlay.clearRect(0, 0, viewport.width, viewport.height);

        if (this.state === GameState.PLAYING) {
            render(this.glCtx, this.level.tiles);
        } else if (this.state === GameState.FALLING) {
            render(this.glCtx, [...this.fallingTiles]);
        } else if (this.state === GameState.WAITING_PILES || this.state === GameState.ANIMATING) {

            // Draw the frame
            this.drawMosaicFrame();

            // WebGL Clipping for the mosaic
            if (this.revealFrameRect) {
                const { x, y, w, h } = this.revealFrameRect;
                const gl = this.glCtx.gl;
                gl.enable(gl.SCISSOR_TEST);
                // GL coords are bottom-left. Canvas coords are top-left.
                // y_gl = height - (y_canvas + h_canvas)
                gl.scissor(x, viewport.height - (y + h), w, h);
                render(this.glCtx, this.getRevealedMosaicTiles());
                gl.disable(gl.SCISSOR_TEST);
            } else {
                render(this.glCtx, this.getRevealedMosaicTiles());
            }

            // Draw pile indicators
            const ctx = this.overlay;
            for (const pile of this.pilePositions) {
                if (this.animatedPiles.has(pile.colorID)) continue; // Already animated
                ctx.save();
                ctx.beginPath();
                ctx.arc(pile.x, pile.y, 40, 0, Math.PI * 2);
                ctx.fillStyle = PALETTE[pile.colorID].css;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();

                // Draw tile count
                const sprites = this.pileSpritesByColor.get(pile.colorID);
                if (sprites && sprites.length > 0) {
                    ctx.save();
                    ctx.font = 'bold 20px system-ui';
                    ctx.fillStyle = '#fff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 4;
                    ctx.fillText(sprites.length.toString(), pile.x, pile.y);
                    ctx.restore();
                }
            }

            // Draw instruction
            if (this.state === GameState.WAITING_PILES && this.animatedPiles.size === 0) {
                ctx.save();
                ctx.font = '20px system-ui';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 6;
                ctx.fillText('Tap a pile to reveal', viewport.width / 2, viewport.height / 2);
                ctx.restore();
            }
        } else if (this.state === GameState.DONE) {
            // Draw the frame
            this.drawMosaicFrame();

            // WebGL Clipping for the mosaic
            if (this.revealFrameRect) {
                const { x, y, w, h } = this.revealFrameRect;
                const gl = this.glCtx.gl;
                gl.enable(gl.SCISSOR_TEST);
                gl.scissor(x, viewport.height - (y + h), w, h);
                render(this.glCtx, this.getRevealedMosaicTiles());
                gl.disable(gl.SCISSOR_TEST);
            } else {
                render(this.glCtx, this.getRevealedMosaicTiles());
            }

            const ctx = this.overlay;
            ctx.save();
            ctx.font = "bold 36px system-ui";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 10;
            ctx.fillText("Mosaic Complete!", viewport.width / 2, 60);

            ctx.font = "20px system-ui";
            ctx.fillText("Tap to continue", viewport.width / 2, viewport.height - 40);

            ctx.restore();
        }
    }

    private drawMosaicFrame() {
        if (!this.revealFrameRect) return;
        const { x, y, w, h } = this.revealFrameRect;

        const ctx = this.overlay;
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 5, y - 5, w + 10, h + 10); // visual padding relative to content (already has internal padding)
        ctx.restore();
    }

    onResize() {
        // resizeGL(this.glCtx);
    }

    onPointerDown(x: number, y: number) {
        if (this.state === GameState.DONE) {
            if (this.revealDone) {
                import("./lobbyScreen").then(({ LobbyScreen }) => {
                    this.manager.switch(
                        new LobbyScreen(this.manager, this.glCtx, this.overlay)
                    );
                });
            }
            return;
        }

        // Handle pile clicks in reveal states
        if (this.state === GameState.WAITING_PILES || this.state === GameState.ANIMATING) {
            // Check if user clicked on a pile indicator
            for (const pile of this.pilePositions) {
                if (this.animatedPiles.has(pile.colorID)) continue;
                const dist = Math.hypot(x - pile.x, y - pile.y);
                if (dist <= 45) { // 40px radius + some tolerance
                    this.animatePile(pile.colorID);
                    return;
                }
            }
            return;
        }

        const tile = tileAt(x, y, this.level.tiles);
        if (tile) {
            this.isDragging = true;
            this.level.selectedTiles = [tile];
            tile.isHighlighted = true;
        }
    }

    onPointerMove(x: number, y: number) {
        if (this.state !== GameState.PLAYING) return;
        if (!this.isDragging) return;
        const tile = tileAt(x, y, this.level.tiles);
        if (tile) {
            const prev = this.level.selectedTiles[this.level.selectedTiles.length - 1];
            if (prev) this.level.processTileSelection(prev, tile);
        }
    }

    onPointerUp() {
        // Reserved for finalizing selection
        if (this.state !== GameState.PLAYING) return;
        if (!this.isDragging) return;
        this.isDragging = false;

        // Perform animation if valid connection
        if (this.level.selectedTiles.length > 1) {
            // Force a render to ensure the WebGL buffer has the latest state for extraction
            // (In case preserveDrawingBuffer is false and the buffer was cleared)
            render(this.glCtx, this.level.tiles);
            this.spawnConnectionAnimations();
        }

        this.level.finalizeConnection();
        this.updateHUD(); // Logic for standardizing HUD needs to handle animation timing if we want the count to update AFTER animation
        // But for now, updating immediately is fine, the animation is "collecting"
    }

    private spawnConnectionAnimations() {
        const selected = this.level.selectedTiles;
        if (selected.length === 0) return;

        // Extract sprites
        // Import must be at top, assuming update adds it
        const spritesMap = extractSelectedSprites(this.glCtx.gl, this.level.tiles, selected);

        // Find target position (HUD)
        // We need the color ID of the connection
        const colorID = selected[0].colorID;
        const targetEl = document.querySelector(`.tile-dot[data-color-id="${colorID}"]`);

        let tx = viewport.width / 2;
        let ty = viewport.height - 50;

        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            tx = rect.left + rect.width / 2;
            ty = rect.top + rect.height / 2;
        }

        // Create animations
        const delayPerTile = 0.04; // 40ms

        selected.forEach((tile, index) => {
            const canvas = spritesMap.get(tile);
            if (!canvas) return;

            // Add to DOM
            canvas.style.zIndex = "1000"; // Ensure it's on top
            document.body.appendChild(canvas);
            // It is already positioned absolutely by extractSelectedSprites

            // Current pos on screen
            const startX = tile.pos.x;
            const startY = tile.pos.y;

            this.activeAnimations.push({
                el: canvas,
                startX,
                startY,
                targetX: tx,
                targetY: ty,
                startTime: this.animationTime + index * delayPerTile,
                duration: 0.6 // 600ms flight
            });
        });
    }


    private updateHUD() {
        const container = document.getElementById("tile-requirements");
        if (!container) return;

        // Simple diffing could be better, but let's just use rebuild for now and ensure IDs
        container.innerHTML = "";

        for (const [colorID, required] of this.level.winTiles.entries()) {
            if (required === 0) continue; // Don't show if not required
            const collected = this.level.collectedTiles.get(colorID) || 0;
            const remaining = required - collected;

            const el = document.createElement("div");
            el.className = "tile-count";

            const dot = document.createElement("div");
            dot.className = "tile-dot";
            dot.style.backgroundColor = PALETTE[colorID].css;
            dot.setAttribute("data-color-id", colorID.toString());

            const text = document.createElement("span");
            text.textContent = remaining > 0 ? remaining.toString() : "✓";

            el.appendChild(dot);
            el.appendChild(text);
            container.appendChild(el);
        }
    }
}
