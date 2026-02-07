import { Tile } from "../model/types/tile";
import { GameTile } from "../model/components/gameTile";
import { ColorNumber } from "../model/types/color";

/**
 * Manages a collection of tiles with operations for adding, removing, and hit-testing.
 * Provides a clean, reusable interface for any screen that needs tile manipulation.
 */
export class TileManager {
    private tiles: Tile[] = [];

    /**
     * Add a tile at the specified position
     */
    addTile(x: number, y: number, size: number, colorID: ColorNumber): Tile {
        const tile = new GameTile(
            { x, y },
            { x: 0, y: 0 },
            size,
            colorID
        );
        this.tiles.push(tile);
        return tile;
    }

    /**
     * Remove a specific tile
     */
    removeTile(tile: Tile): boolean {
        const index = this.tiles.indexOf(tile);
        if (index !== -1) {
            this.tiles.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Remove the tile closest to the given position
     */
    removeTileAt(x: number, y: number): Tile | null {
        const tile = this.tileAt(x, y);
        if (tile) {
            this.removeTile(tile);
            return tile;
        }
        return null;
    }

    /**
     * Find the tile closest to the given position.
     * Returns the tile whose center is closest relative to its size.
     */
    tileAt(x: number, y: number): Tile | null {
        let best: Tile | null = null;
        let bestDist = Infinity;

        for (const tile of this.tiles) {
            const dx = x - tile.pos.x;
            const dy = y - tile.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Normalize by tile size to favor smaller tiles when clicking near centers
            const normalizedDist = dist / tile.size;

            if (normalizedDist < bestDist && normalizedDist < 1) {
                bestDist = normalizedDist;
                best = tile;
            }
        }

        return best;
    }

    /**
     * Get all tiles (read-only view)
     */
    getAllTiles(): readonly Tile[] {
        return this.tiles;
    }

    /**
     * Get mutable array for physics updates
     */
    getTilesMutable(): Tile[] {
        return this.tiles;
    }

    /**
     * Replace all tiles with a new set
     */
    setTiles(tiles: Tile[]): void {
        this.tiles = [...tiles];
    }

    /**
     * Clear all tiles
     */
    clear(): void {
        this.tiles = [];
    }

    /**
     * Get the count of tiles
     */
    get count(): number {
        return this.tiles.length;
    }
}
