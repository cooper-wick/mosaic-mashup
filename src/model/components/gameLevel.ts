import { Tile } from "../types/tile";
import { Level } from "../types/level";

export class GameLevel implements Level {
    randomSeed: number;
    tiles: Tile[] = [];
    winTiles: Map<number, number> = new Map();
    collectedTiles: Map<number, Tile> = new Map();
    selectedTiles: Tile[] = [];

    constructor(
        randomSeed: number,
        winTiles: Map<number, number>
    ) {
        this.randomSeed = randomSeed;
        this.winTiles = winTiles;
    }

    isLevelFull(): boolean {
        return false;
    }

    addTile(): {} {
        return {};
    }

    fillLevel(): {} {
        return {};
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

        // Wrong color should be ignored
        if (!prev.isSameColor(curr)) {
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

                this.collectedTiles.set(
                    this.collectedTiles.size,
                    tile
                );
            }

            this.selectedTiles = [];

            // Refill will be handled later
            this.fillLevel();
        }
    }


    isGameWon(): boolean {
        return false;
    }
}
