import { Screen } from "../model/types/screen";
import { ScreenManager } from "./screenManager";
import { VoronoiContext, render, resizeGL } from "../shaders/rendering";
import { extractSelectedSprites } from "../shaders/extraction";
import { GameLevel } from "../model/components/gameLevel";

import { viewport } from "../utils/viewport";
import { PALETTE } from "../utils/constants";
import { Tile } from "../model/types/tile";
import { GameTile } from "../model/components/gameTile";
import { ColorNumber } from "../model/types/color";
import { stepTiles } from "../physics.ts";
import { tileAt } from "../gameLogic.ts";
import { MosaicSerializer } from "../utils/mosaicSerializer";
import { mosaicEncodings } from "../model/levels/mosaicEncodings";

enum GameState {
    PLAYING,
    REVEALING
}

interface FlyingTile {
    tile: Tile;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    delay: number;
    progress: number;
}

export class GameplayScreen implements Screen {
    // Existing properties...
    private level!: GameLevel;
    private state: GameState = GameState.PLAYING;

    // Reveal animation state
    private fallingTiles: Tile[] = [];
    private flyingTiles: FlyingTile[] = [];
    private elapsedReveal = 0;
    private revealDone = false;

    private isDragging = false;

    private readonly STAGGER = 0.05;

    // --- NEW: Connection Animations ---
    private activeAnimations: {
        el: HTMLCanvasElement;
        startX: number;
        startY: number;
        targetX: number;
        targetY: number;
        startTime: number;
        duration: number;
    }[] = [];
    private animationTime = 0;
    // ----------------------------------

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
        this.flyingTiles = [];
        this.elapsedReveal = 0;
        this.revealDone = false;
        this.activeAnimations = [];
        this.animationTime = 0;

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
    }

    update(dt: number) {
        if (this.state === GameState.PLAYING) {
            stepTiles(this.level.tiles, viewport.width, viewport.height);
            this.updateAnimations(dt);
            if (this.level.isGameWon()) {
                this.startReveal();
            }
        } else {
            this.updateReveal(dt);
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
                toRemove.push(i);
                continue;
            }

            const t = elapsed / anim.duration;
            // Easing: easeOutCubic
            const ease = 1 - Math.pow(1 - t, 3);

            const currX = anim.startX + (anim.targetX - anim.startX) * ease;
            const currY = anim.startY + (anim.targetY - anim.startY) * ease;

            // Scale effect: pop out then shrink
            // 0 -> 0.2: scale 1 -> 1.2
            // 0.2 -> 1.0: scale 1.2 -> 0.5
            let scale = 1;
            if (t < 0.2) {
                scale = 1 + t; // 1.0 to 1.2
            } else {
                scale = 1.2 - (t - 0.2) * 0.8; // 1.2 down to ~0.5
            }

            // Adjust for canvas centering
            const halfW = anim.el.width / 2;
            const halfH = anim.el.height / 2;
            const left = parseFloat(anim.el.style.left);
            const top = parseFloat(anim.el.style.top);

            const tx = currX - (left + halfW);
            const ty = currY - (top + halfH);

            anim.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
            anim.el.style.opacity = `${1 - t * 0.5}`; // Fade partial
        }

        // Remove backwards to avoid index issues
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.activeAnimations.splice(toRemove[i], 1);
        }
    }

    private startReveal() {
        this.state = GameState.REVEALING;
        this.elapsedReveal = 0;
        this.revealDone = false;

        // Cleanup active animations
        for (const anim of this.activeAnimations) {
            anim.el.remove();
        }
        this.activeAnimations = [];

        // Convert current tiles to falling tiles
        this.fallingTiles = [...this.level.tiles];
        // Clear level tiles so physics stops affecting them
        this.level.tiles = [];

        // Build flying tiles
        this.buildFlyingTiles(this.level.completedMosaic.tiles);

        const el = document.getElementById("tile-requirements");
        if (el) el.style.display = "none";
    }

    private buildFlyingTiles(targetTiles: Tile[]) {
        const byColor = new Map<ColorNumber, Tile[]>();
        for (const t of targetTiles) {
            const arr = byColor.get(t.colorID) ?? [];
            arr.push(t);
            byColor.set(t.colorID, arr);
        }

        const colors = Array.from(byColor.keys());
        const pileY = viewport.height + 60;
        const spacing = viewport.width / (colors.length + 1);

        let index = 0;
        for (let c = 0; c < colors.length; c++) {
            const colorID = colors[c];
            const group = byColor.get(colorID)!;
            const pileX = spacing * (c + 1);

            for (const original of group) {
                const tile = new GameTile(
                    { x: pileX, y: pileY },
                    { x: 0, y: 0 },
                    original.size,
                    original.colorID
                );

                this.flyingTiles.push({
                    tile,
                    startX: pileX,
                    startY: pileY,
                    targetX: original.pos.x,
                    targetY: original.pos.y,
                    delay: index * this.STAGGER,
                    progress: 0,
                });
                index++;
            }
        }
    }

    private updateReveal(dt: number) {
        this.elapsedReveal += dt;

        // Apply gravity to falling tiles
        for (const t of this.fallingTiles) {
            t.vel.y += 400 * dt;
            t.pos.x += t.vel.x * dt;
            t.pos.y += t.vel.y * dt;
        }
    }

    render() {
        this.overlay.clearRect(0, 0, viewport.width, viewport.height);

        if (this.state === GameState.PLAYING) {
            render(this.glCtx, this.level.tiles);
        } else {
            // Render falling (gameplay) tiles + flying (mosaic) tiles
            render(this.glCtx, [...this.fallingTiles, ...this.flyingTiles.map(f => f.tile)]);

            if (this.revealDone) {
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
    }

    onResize() {
        resizeGL(this.glCtx);
    }

    onPointerDown(x: number, y: number) {
        if (this.state === GameState.REVEALING) {
            if (this.revealDone) {
                import("./lobbyScreen").then(({ LobbyScreen }) => {
                    this.manager.switch(
                        new LobbyScreen(this.manager, this.glCtx, this.overlay)
                    );
                });
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
        // Order: first selected to last selected? Or reverse?
        // "sequentially animation cells when they are finalizeConnection-ed... order in which they were selected"

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
