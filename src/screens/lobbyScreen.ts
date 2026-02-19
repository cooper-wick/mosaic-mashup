import { Screen } from "../model/types/screen";
import { ScreenManager } from "./screenManager";
import { GameplayScreen } from "./gameplayScreen";
import { DrawScreen } from "./drawScreen";
import { VoronoiContext, render } from "../shaders/rendering";
import { Tile } from "../model/types/tile";
import { GameTile } from "../model/components/gameTile";
import { TileGenerator } from "../model/logic/TileGenerator";
import { viewport } from "../utils/viewport";
import { palette } from "../utils/constants";

export class LobbyScreen implements Screen {
    private tiles: Tile[] = [];
    private floatingTiles: Tile[] = [];

    constructor(
        private manager: ScreenManager,
        private glCtx: VoronoiContext,
        private overlay: CanvasRenderingContext2D
    ) { }

    enter() {
        // Show lobby UI (you could toggle DOM visibility or draw on overlay)
        const el = document.getElementById("lobby");
        if (el) el.style.display = "flex";

        const btnPlay1 = document.getElementById("btn-play");
        if (btnPlay1) {
            btnPlay1.onclick = () => this.startGame(0);
        }
        const btnPlay2 = document.getElementById("btn-play-2");
        if (btnPlay2) {
            btnPlay2.onclick = () => this.startGame(1);
        }
        const btnPlay3 = document.getElementById("btn-play-3");
        if (btnPlay3) {
            btnPlay3.onclick = () => this.startGame(2);
        }
        const btnCreateLevel = document.getElementById("btn-create-level");
        if (btnCreateLevel) {
            btnCreateLevel.onclick = () => this.manager.switch(new DrawScreen(this.manager, this.glCtx, this.overlay));
        }

        // Hide bucket container (if it exists) since it's not relevant in lobby
        const container = document.getElementById("bucket-container");
        if (!container) return;
        container.style.display = "none";

        this.initBackground();
    }

    private initBackground() {
        this.tiles = [];
        this.floatingTiles = [];

        // 1. Static background tiles
        // We want to fill the screen somewhat densely
        const area = viewport.width * viewport.height;
        let coveredArea = 0;
        const targetDensity = 1.2; // Overfill slightly to ensure good coverage

        while (coveredArea < area * targetDensity) {
            const r = TileGenerator.getRandomRadius() * 1.5; // Slightly larger for background
            const x = Math.random() * viewport.width;
            const y = Math.random() * viewport.height;
            const colorID = Math.floor(Math.random() * palette.length);

            this.tiles.push(new GameTile(
                { x, y },
                { x: 0, y: 0 },
                r,
                colorID
            ));
            coveredArea += Math.PI * r * r;
        }

        // 2. Floating tiles
        const numFloating = 15;
        for (let i = 0; i < numFloating; i++) {
            this.spawnFloatingTile(true);
        }
    }

    private spawnFloatingTile(randomY: boolean = false) {
        const r = TileGenerator.getRandomRadius();
        const x = Math.random() * viewport.width;
        // If randomY is true, place anywhere (for initial state).
        // Otherwise, place at bottom.
        const y = randomY ? Math.random() * viewport.height : viewport.height + r + Math.random() * 100;

        // Random palette color
        const colorID = Math.floor(Math.random() * palette.length);

        // Upward velocity
        const vy = - (20 + Math.random() * 40);

        const tile = new GameTile(
            { x, y },
            { x: 0, y: vy },
            r,
            colorID
        );
        this.floatingTiles.push(tile);
    }

    exit() {
        const el = document.getElementById("lobby");
        if (el) el.style.display = "none";
    }

    update(dt: number) {
        // Update floating tiles
        for (let i = this.floatingTiles.length - 1; i >= 0; i--) {
            const tile = this.floatingTiles[i];
            tile.pos.y += tile.vel.y * dt;

            // Reset if goes off top
            if (tile.pos.y < -tile.size * 2) {
                // Remove and respawn to keep variety
                this.floatingTiles.splice(i, 1);
                this.spawnFloatingTile(false);
            }
        }
    }

    render() {
        // Render background
        // Combine static and floating for rendering
        const allTiles = [...this.tiles, ...this.floatingTiles];
        render(this.glCtx, allTiles);
    }

    /** Call this from a "Play" button or from onPointerDown */
    startGame(levelIndex: number) {
        this.manager.switch(
            new GameplayScreen(this.manager, this.glCtx, this.overlay, levelIndex)
        );
    }


}
