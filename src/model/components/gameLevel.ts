import {Tile} from "../types/tile";
import {GameTile} from "./gameTile";
import {Level} from "../types/level";
import {mb32} from "../../utils/random.ts";
import {Mosaic} from "../types/mosaic";
import {viewport} from "../../utils/viewport.ts";
import {ColorNumber} from "../types/color";

export class GameLevel implements Level {
    randomSeed?: number;
    tiles: Tile[] = [];
    winTiles: Map<ColorNumber, number>;
    collectedTiles: Map<ColorNumber, number> = new Map();
    selectedTiles: Tile[] = [];

    private readonly random: () => number;
    private accumulatedSize = 0;

    constructor(
        completedMosaic: Mosaic,
        randomSeed?: number
    ) {
        this.winTiles = new Map(completedMosaic.getWinTiles());
        this.random = randomSeed !== undefined ? mb32(randomSeed) : Math.random;
    }


    addTile(size: number): void {
        // Step 1: pick a random color from winTiles keys
        const colorIDs = Array.from(this.winTiles.keys());
        if (colorIDs.length === 0) return; // safety check

        // Generate a random index based on the number of colors
        const rand = this.random(); // 0 is just a dummy argument; mb32 ignores it
        const colorIndex = Math.floor(rand * colorIDs.length);
        const colorID = colorIDs[colorIndex];

        // Random x position along the top of the viewport
        const randX = Math.floor(this.random() * viewport.width);

        // Step 2: create the tile
        const tile = new GameTile(
            {x: randX, y: -viewport.height},
            {x: 0, y: 0},
            size,
            colorID
        );

        // Step 3: add tile to the level
        this.tiles.push(tile);
    }

    fillLevel(): void {
        const minSize = viewport.width/20; // 5% of viewport width
        const maxSize = viewport.width/10; // 10% of viewport width

        while (this.accumulatedSize >= minSize) {
            // Random tile size between 40 and 80
            const randSize = Math.floor(this.random() * (maxSize - minSize + 1)) + minSize;

            // Call addTile to create the tile of this size
            this.addTile(randSize);

            this.accumulatedSize -= randSize;
        }
    }

    isAdjacentTiles(tile1: Tile, tile2: Tile): boolean {
        // Same tile is not adjacent
        if (tile1 === tile2) return false;

        // Midpoint between tile centers
        const midpoint = {
            x: (tile1.pos.x + tile2.pos.x) / 2,
            y: (tile1.pos.y + tile2.pos.y) / 2,
        };

        let closest: Tile | null = null;
        let minDistSq = Infinity;

        for (const tile of this.tiles) {
            const dx = tile.pos.x - midpoint.x;
            const dy = tile.pos.y - midpoint.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                closest = tile;
            }
        }

        // Adjacent if midpoint belongs to either tile
        return closest === tile1 || closest === tile2;
    }

    processTileSelection(prev: Tile, curr: Tile): void {
        // Same tile => no movement
        if (prev === curr) {
            return;
        }

        // Wrong color and non-adjacent tiles should be ignored
        if (!prev.isSameColor(curr) || !this.isAdjacentTiles(prev, curr)) {
            return;
        }

        const index = this.selectedTiles.indexOf(curr);

        // New tile: append
        if (index === -1) {
            this.selectedTiles.push(curr);
            curr.isHighlighted = true;
            return;
        }

        // Backtracking: remove everything after curr
        for (let i = this.selectedTiles.length - 1; i > index; i--) {
            this.selectedTiles[i].isHighlighted = false;
            this.selectedTiles.pop();
        }
    }


    finalizeConnection(): void {
        const n = this.selectedTiles.length;

        // Invalid connection: deselect single tile
        if (n === 1) {
            const tile = this.selectedTiles[0];
            tile.isHighlighted = false;
            this.selectedTiles = [];
            return;
        }

        // Valid connection: remove selected tiles
        if (n > 1) {
            for (const tile of this.selectedTiles) {
                tile.isHighlighted = false;

                const index = this.tiles.indexOf(tile);
                if (index !== -1) {
                    this.tiles.splice(index, 1);
                }

                // Sum up the sizes for refill
                this.accumulatedSize += tile.size;

                // Increment collectedTiles count for this color
                const prevCount = this.collectedTiles.get(tile.colorID) ?? 0;
                this.collectedTiles.set(tile.colorID, prevCount + 1);
            }

            this.selectedTiles = [];

            // Refill using the total size of removed tiles
            this.fillLevel();
        }
    }


    isGameWon(): boolean {
        for (const [colorID, count] of this.winTiles) {
            if (!this.collectedTiles.has(colorID) || this.collectedTiles.get(colorID)! < count) {
                return false;
            }
        }

        return true;
    }
}
