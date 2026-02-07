import {Screen} from "../model/types/screen";
import {ScreenManager} from "./screenManager";
import {VoronoiContext, render, resizeGL} from "../shaders/rendering";
import {GameLevel} from "../model/components/gameLevel";
import {CompletedMosaic} from "../model/components/completedMosaic";
import {viewport} from "../utils/viewport";
import {PALETTE} from "../utils/constants";
import {Tile} from "../model/types/tile";
import {GameTile} from "../model/components/gameTile";
import {ColorNumber} from "../model/types/color";
import {stepTiles} from "../physics.ts";
import {generateLevel} from "../utils/levelGen.ts";
import {tileAt} from "../gameLogic.ts";

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
    private level!: GameLevel;
    private state: GameState = GameState.PLAYING;

    // Reveal animation state
    private fallingTiles: Tile[] = [];
    private flyingTiles: FlyingTile[] = [];
    private elapsedReveal = 0;
    private revealDone = false;

    private isDragging = false;

    private readonly STAGGER = 0.05;

    constructor(
        private manager: ScreenManager,
        private glCtx: VoronoiContext,
        private overlay: CanvasRenderingContext2D,
        private levelIndex: number
    ) {
    }

    // ── Lifecycle ──────────────────────────────────────────

    enter() {
        const tiles: Tile[] = generateLevel(this.levelIndex);
        const mosaic = new CompletedMosaic("level-" + this.levelIndex, tiles);
        this.level = new GameLevel(mosaic);
        this.level.tiles = tiles;

        this.state = GameState.PLAYING;
        this.fallingTiles = [];
        this.flyingTiles = [];
        this.elapsedReveal = 0;
        this.revealDone = false;

        this.updateHUD();

        const el = document.getElementById("tile-requirements");
        if (el) el.style.display = "flex";
    }

    exit() {
        const el = document.getElementById("tile-requirements");
        if (el) el.style.display = "none";
    }

    update(dt: number) {
        if (this.state === GameState.PLAYING) {
            stepTiles(this.level.tiles, viewport.width, viewport.height);
            if (this.level.isGameWon()) {
                this.startReveal();
            }
        } else {
            this.updateReveal(dt);
        }
    }

    private startReveal() {
        this.state = GameState.REVEALING;
        this.elapsedReveal = 0;
        this.revealDone = false;

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
                    {x: pileX, y: pileY},
                    {x: 0, y: 0},
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
                import("./lobbyScreen").then(({LobbyScreen}) => {
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
        this.level.finalizeConnection();
        this.updateHUD();
    }


    private updateHUD() {
        const container = document.getElementById("tile-requirements");
        if (!container) return;
        container.innerHTML = "";

        for (const [colorID, required] of this.level.winTiles.entries()) {
            const collected = this.level.collectedTiles.get(colorID) || 0;
            const remaining = required - collected;

            const el = document.createElement("div");
            el.className = "tile-count";

            const dot = document.createElement("div");
            dot.className = "tile-dot";
            dot.style.backgroundColor = PALETTE[colorID].css;

            const text = document.createElement("span");
            text.textContent = remaining > 0 ? remaining.toString() : "✓";

            el.appendChild(dot);
            el.appendChild(text);
            container.appendChild(el);
        }
    }
}
