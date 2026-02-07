import { Screen } from "../model/types/screen";
import { ScreenManager } from "./screenManager";
import { VoronoiContext, render, renderIds } from "../shaders/rendering";
import { extractSelectedSprites, extractSpritesFromData } from "../shaders/extraction";
import { GameLevel } from "../model/components/gameLevel";

import { viewport } from "../utils/viewport";
import { palette } from "../utils/constants";
import { Tile } from "../model/types/tile";
import { ColorNumber } from "../model/types/color";
import { stepTiles } from "../physics";
import { tileAt } from "../gameLogic";
import { MosaicSerializer } from "../utils/mosaicSerializer";
import { mosaicEncodings } from "../model/levels/mosaicEncodings";
import { GameTile } from "../model/components/gameTile";
import { MosaicBucket } from "./components/mosaicBucket";

enum GameState {
    SLIDING_IN,     // Container sliding down from top
    PLAYING,
    SLIDING_OUT,    // Container sliding down to bottom
    WAITING_PILES,  // Waiting for user to click piles
    ANIMATING,      // Tiles flying to final positions
    DONE            // Animation complete
}

export class GameplayScreen implements Screen {
    private level!: GameLevel;
    private state: GameState = GameState.SLIDING_IN;

    // Container Slide State
    private containerY = 0;

    // Reveal animation state
    private revealDone = false;

    private isDragging = false;

    private revealedTiles: Set<Tile> = new Set();

    // Buckets
    private buckets: Map<ColorNumber, MosaicBucket> = new Map();

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

    // Pre-captured sprites for flying tiles
    // We only need the sprites and final positions now. The "pile" position comes from the bucket DOM.
    private pileSpritesByColor: Map<ColorNumber, { canvas: HTMLCanvasElement; tile: Tile; finalPos: { x: number; y: number } }[]> = new Map();
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

        // Pre-warm physics to settle tiles
        const limit = 1000;
        const bottomY = viewport.height;
        for (let i = 0; i < limit; i++) {
            stepTiles(this.level.tiles, viewport.width, viewport.height);
            if (this.level.tiles.some(t => t.pos.y + t.size >= bottomY - 10)) {
                break;
            }
        }

        // Start off-screen (above)
        this.containerY = -viewport.height;
        this.state = GameState.SLIDING_IN;

        this.revealDone = false;
        this.activeAnimations = [];
        this.animationTime = 0;
        this.pileSpritesByColor.clear();
        this.animatedPiles.clear();
        this.revealedTiles.clear();
        this.buckets.clear();

        this.initBuckets();

        const el = document.getElementById("bucket-container");
        if (el) el.style.display = "flex";

        // Show instruction
        const instruction = document.getElementById("game-instruction");
        if (instruction) {
            instruction.classList.add("visible");
        }
    }

    private initBuckets() {
        const container = document.getElementById("bucket-container");
        if (!container) return;
        container.style.display = "flex";
        container.innerHTML = "";

        // Create buckets for each required color
        for (const [colorID, required] of this.level.winTiles.entries()) {
            if (required === 0) continue;

            const bucket = new MosaicBucket(container, colorID, required);
            this.buckets.set(colorID, bucket);
        }
        this.updateBuckets();
    }

    private updateBuckets() {
        for (const [colorID, bucket] of this.buckets) {
            const collected = this.level.collectedTiles.get(colorID) || 0;
            bucket.update(collected);
        }
    }

    exit() {
        const el = document.getElementById("bucket-container");
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

        const instruction = document.getElementById("game-instruction");
        if (instruction) instruction.classList.remove("visible");

        this.overlay.clearRect(0, 0, viewport.width, viewport.height);
    }

    update(dt: number) {
        if (this.state === GameState.SLIDING_IN) {
            const target = 0;
            const diff = target - this.containerY;
            this.containerY += diff * 8.0 * dt;

            if (Math.abs(diff) < 3.0) {
                this.containerY = target;
                this.state = GameState.PLAYING;
            }
            stepTiles(this.level.tiles, viewport.width, viewport.height);

        } else if (this.state === GameState.PLAYING) {
            stepTiles(this.level.tiles, viewport.width, viewport.height);
            this.updateAnimations(dt);
            if (this.level.isGameWon()) {
                this.startReveal();
            }
        } else if (this.state === GameState.SLIDING_OUT) {
            const target = viewport.height + 200;
            const diff = target - this.containerY;
            this.containerY += (diff * 2.0 + 100) * dt;

            if (this.containerY > viewport.height + 50) {
                this.state = GameState.WAITING_PILES;
                this.enableRevealInteractions();
            }
            stepTiles(this.level.tiles, viewport.width, viewport.height);

        } else if (this.state === GameState.WAITING_PILES || this.state === GameState.ANIMATING) {
            this.updateAnimations(dt);
            // Check if all piles animated and animations done
            // The number of piles to animate is the number of buckets
            if (this.state === GameState.ANIMATING &&
                this.animatedPiles.size === this.buckets.size &&
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

            if (elapsed < 0) continue;

            if (elapsed >= anim.duration) {
                anim.el.remove();
                if (anim.tile) {
                    this.revealedTiles.add(anim.tile);
                }
                toRemove.push(i);
                continue;
            }

            const t = elapsed / anim.duration;
            const ease = 1 - Math.pow(1 - t, 3);

            const currX = anim.startX + (anim.targetX - anim.startX) * ease;
            const currY = anim.startY + (anim.targetY - anim.startY) * ease;
            const scale = 0.3 + 0.7 * ease;

            const halfW = anim.el.width / 2;
            const halfH = anim.el.height / 2;
            const left = parseFloat(anim.el.style.left);
            const top = parseFloat(anim.el.style.top);

            const tx = currX - (left + halfW);
            const ty = currY - (top + halfH);

            anim.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
            anim.el.style.opacity = `${0.3 + 0.8 * ease}`;
        }

        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.activeAnimations.splice(toRemove[i], 1);
        }
    }

    private startReveal() {
        this.state = GameState.SLIDING_OUT;
        this.revealDone = false;

        palette.addColor({
            gl: [0.60, 0.60, 0.60],
            css: '#4d4d4d'
        })

        for (const anim of this.activeAnimations) {
            anim.el.remove();
        }
        this.activeAnimations = [];

        this.setupRevealImages(this.level.completedMosaic.tiles);

        const el = document.getElementById("bucket-container");
        // Ensure it's still visible
        if (el) el.style.display = "flex";
    }

    private enableRevealInteractions() {
        // Make buckets interactive
        for (const [colorID, bucket] of this.buckets) {
            // How many tiles are in the reveal?
            // It matches the total required count for this color in the level.
            // (Assumes completedMosaic matches level requirements)
            const count = this.level.winTiles.get(colorID) || 0;
            bucket.setRevealMode(count);

            // Add click listener
            bucket.element.onclick = (e) => {
                e.stopPropagation(); // prevent game click
                this.animatePile(colorID);
                bucket.setInteractive(false);
                // After clicking, maybe we show checkmark or empty state?
                // For now, let's just make it non-interactive.
                // The animation will fill the mosaic.
                // Maybe update bucket to 0?
                bucket.update(0); // "0 remaining" or just empty?
                // Actually, if we update(0), it shows "0/Target".
                // If we want to hide it, we can.
                // Let's leave it as is for now.
            };
        }
    }

    private setupRevealImages(targetTiles: Tile[]) {
        // Calculate the actual bounding box of the tiles
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const t of targetTiles) {
            if (t.pos.x - t.size < minX) minX = t.pos.x - t.size;
            if (t.pos.x + t.size > maxX) maxX = t.pos.x + t.size;
            if (t.pos.y - t.size < minY) minY = t.pos.y - t.size;
            if (t.pos.y + t.size > maxY) maxY = t.pos.y + t.size;
        }

        const internalPadding = 20;
        minX -= internalPadding;
        minY -= internalPadding;
        maxX += internalPadding;
        maxY += internalPadding;

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        const padding = 50;
        const availableW = viewport.width - padding * 2;
        const availableH = viewport.height - padding * 2; // Subtract bucket height?
        // Buckets are at bottom 20px + height ~60px + padding. Say 100px.
        const scale = Math.min(availableW / contentW, (availableH - 80) / contentH);

        const frameW = contentW * scale;
        const frameH = contentH * scale;
        const frameX = (viewport.width - frameW) / 2;
        const frameY = (viewport.height - frameH) / 2 - 40; // Shift up a bit to avoid buckets

        this.revealFrameRect = { x: frameX, y: frameY, w: frameW, h: frameH };

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

        // Create capture tiles for rendering (scaled)
        const captureTiles: Tile[] = targetTiles.map(t => {
            const newT = t.clone();
            newT.pos.x = frameX + (t.pos.x - minX) * scale;
            newT.pos.y = frameY + (t.pos.y - minY) * scale;
            newT.size = t.size * scale;
            return newT;
        });

        // Render & Capture logic (same as before)
        const gl = this.glCtx.gl;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        const scaledGap = 0.1;
        const scaledAa = scaledGap * 0.1;
        render(this.glCtx, captureTiles, false, { x: 0, y: 0 }, { w: width, h: height }, scaledGap, scaledAa);
        const visualData = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, visualData);

        renderIds(this.glCtx, captureTiles, { x: 0, y: 0 }, { w: width, h: height }, scaledGap, scaledAa);
        const idData = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, idData);

        const spritesMap = extractSpritesFromData(visualData, idData, width, height, captureTiles);

        // Group sprites by color
        const byColor = new Map<ColorNumber, Tile[]>();
        for (const t of captureTiles) {
            const arr = byColor.get(t.colorID) ?? [];
            arr.push(t);
            byColor.set(t.colorID, arr);
        }

        this.pileSpritesByColor.clear();

        for (const [colorID, group] of byColor) {
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
    private revealContainer: HTMLDivElement | null = null;

    private animatePile(colorID: ColorNumber) {
        if (this.animatedPiles.has(colorID)) return;
        this.animatedPiles.add(colorID);

        const sprites = this.pileSpritesByColor.get(colorID);
        if (!sprites) return;

        const bucket = this.buckets.get(colorID);
        if (!bucket) return;

        const startCenter = bucket.getCenter();
        const startX = startCenter.x;
        const startY = startCenter.y;

        const delayPerTile = 0.04;
        const animDuration = 0.6;

        const container = this.revealContainer;
        if (!container || !this.revealFrameRect) return;
        const { x: frameX, y: frameY } = this.revealFrameRect;

        // Visual flash or effect on bucket?

        sprites.forEach((sprite, index) => {
            const canvas = sprite.canvas;

            const startXRel = startX - frameX;
            const startYRel = startY - frameY;
            const targetXRel = sprite.finalPos.x - frameX;
            const targetYRel = sprite.finalPos.y - frameY;

            canvas.style.position = 'absolute';
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
                // Not animated yet, show ghosts
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

    render() {
        this.overlay.clearRect(0, 0, viewport.width, viewport.height);

        if (this.state === GameState.PLAYING ||
            this.state === GameState.SLIDING_IN ||
            this.state === GameState.SLIDING_OUT) {

            const offset = { x: 0, y: this.containerY };
            render(this.glCtx, this.level.tiles, false, offset);

        } else if (this.state === GameState.WAITING_PILES || this.state === GameState.ANIMATING || this.state === GameState.DONE) {

            this.drawMosaicFrame();

            if (this.revealFrameRect) {
                const { x, y, w, h } = this.revealFrameRect;
                const gl = this.glCtx.gl;
                gl.enable(gl.SCISSOR_TEST);
                gl.scissor(x, viewport.height - (y + h), w, h);
                render(this.glCtx, this.getRevealedMosaicTiles());
                gl.disable(gl.SCISSOR_TEST);
            }

            if (this.state === GameState.DONE) {
                // Hide buckets if they aren't already hidden
                const bucketContainer = document.getElementById("bucket-container");
                if (bucketContainer && bucketContainer.style.display !== "none") {
                    bucketContainer.style.display = "none";
                }

                const ctx = this.overlay;
                ctx.save();

                // 1. "Mosaic Complete!" above frame
                ctx.font = "bold 36px system-ui";
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center";
                ctx.shadowColor = "rgba(0,0,0,0.8)";
                ctx.shadowBlur = 10;

                // Position above the reveal frame with padding
                // const textY = this.revealFrameRect ? this.revealFrameRect.y - 40 : 60;
                // ctx.fillText("Mosaic Complete!", viewport.width / 2, textY);

                // 2. Mosaic Name below frame
                ctx.font = "bold 28px system-ui";
                ctx.fillStyle = "#f8c71a"; // Gold/Yellow distinct color
                const nameY = this.revealFrameRect ? (this.revealFrameRect.y + this.revealFrameRect.h + 50) : viewport.height - 100;
                ctx.fillText(`You Found: ${this.level.completedMosaic.name}`, viewport.width / 2, nameY);

                // Tap to continue (subtle)
                ctx.font = "16px system-ui";
                ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                ctx.shadowBlur = 0;
                ctx.fillText("Tap to continue", viewport.width / 2, viewport.height - 30);

                ctx.restore();
            } else if (this.state === GameState.WAITING_PILES && this.animatedPiles.size === 0) {
                // const ctx = this.overlay;
                // ctx.save();
                // ctx.font = "20px system-ui";
                // ctx.fillStyle = "#fff";
                // ctx.textAlign = "center";
                // ctx.shadowColor = "rgba(0,0,0,0.5)";
                // ctx.shadowBlur = 6;
                //
                // // Position above buckets
                // ctx.fillText('Tap a bucket to fill the mosaic', viewport.width / 2, viewport.height - 120);
                // ctx.restore();
            }
        }
    }

    private drawMosaicFrame() {
        if (!this.revealFrameRect) return;
        const { x, y, w, h } = this.revealFrameRect;

        const ctx = this.overlay;
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
        ctx.restore();
    }

    onResize() {
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

        if (this.state !== GameState.PLAYING) return;

        // Hide instruction on first interaction
        const instruction = document.getElementById("game-instruction");
        if (instruction && instruction.classList.contains("visible")) {
            instruction.classList.remove("visible");
        }

        const gameY = y - this.containerY;
        if (gameY < 0 || gameY > viewport.height) return;

        const tile = tileAt(x, gameY, this.level.tiles);
        if (tile) {
            this.isDragging = true;
            this.level.selectedTiles = [tile];
            tile.isHighlighted = true;
        }
    }

    onPointerMove(x: number, y: number) {
        if (this.state !== GameState.PLAYING) return;
        if (!this.isDragging) return;

        const gameY = y - this.containerY;

        const tile = tileAt(x, gameY, this.level.tiles);
        if (tile) {
            const prev = this.level.selectedTiles[this.level.selectedTiles.length - 1];
            if (prev) this.level.processTileSelection(prev, tile);
        }
    }

    onPointerUp() {
        if (this.state !== GameState.PLAYING) return;
        if (!this.isDragging) return;
        this.isDragging = false;

        if (this.level.selectedTiles.length > 1) {
            render(this.glCtx, this.level.tiles, false, { x: 0, y: this.containerY });
            this.spawnConnectionAnimations();
        }

        this.level.finalizeConnection();
        this.updateBuckets(); // Use new updateBuckets
    }

    private spawnConnectionAnimations() {
        const selected = this.level.selectedTiles;
        if (selected.length === 0) return;

        const spritesMap = extractSelectedSprites(this.glCtx.gl, this.level.tiles, selected);
        const colorID = selected[0].colorID;

        // Target is the bucket center
        const bucket = this.buckets.get(colorID);
        let tx = viewport.width / 2;
        let ty = viewport.height - 50;

        if (bucket) {
            const center = bucket.getCenter();
            tx = center.x;
            ty = center.y;
        }

        const delayPerTile = 0.04;

        selected.forEach((tile, index) => {
            const canvas = spritesMap.get(tile);
            if (!canvas) return;

            canvas.style.zIndex = "1000";
            document.body.appendChild(canvas);

            const startX = tile.pos.x;
            const startY = tile.pos.y + this.containerY;

            this.activeAnimations.push({
                el: canvas,
                startX,
                startY,
                targetX: tx,
                targetY: ty,
                startTime: this.animationTime + index * delayPerTile,
                duration: 0.6
            });
        });
    }
}
