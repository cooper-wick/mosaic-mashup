import { Tile } from "../types/tile";
import { GameTile } from "./gameTile";
import { Level } from "../types/level";
import { mb32 } from "../../utils/random.ts";
import { Mosaic } from "../types/mosaic";
import { viewport } from "../../utils/viewport.ts";
import { ColorNumber } from "../types/color";
import { TileGenerator } from "../logic/TileGenerator";

export class GameLevel implements Level {
    randomSeed?: number;
    tiles: Tile[] = [];
    winTiles: Map<ColorNumber, number>;
    collectedTiles: Map<ColorNumber, number> = new Map();
    selectedTiles: Tile[] = [];

    // Store the source mosaic for the reveal animation
    public completedMosaic: Mosaic;

    private readonly random: () => number;
    // Track the "missing area" that needs to be filled with tiles
    private areaDebt = 0;

    constructor(
        completedMosaic: Mosaic,
        randomSeed?: number
    ) {
        this.completedMosaic = completedMosaic;
        this.winTiles = new Map(completedMosaic.getWinTiles());
        this.random = randomSeed !== undefined ? mb32(randomSeed) : Math.random;

        // Initial population
        this.populateLevel();
    }


    addTile(size: number, x?: number, y?: number): void {
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
            {
                x: x !== undefined ? x : randX,
                y: y !== undefined ? y : -viewport.height // Start above the screen
            },
            { x: 0, y: 0 },
            size,
            colorID
        );


        // Step 3: add tile to the level
        this.tiles.push(tile);
    }

    /**
     * Completely populates the level for the first time.
     * Sets the initial area debt and fills it.
     */
    populateLevel(): void {
        this.areaDebt = TileGenerator.getTargetDensity();
        this.fillDebt();
    }

    /**
     * Refills the level by adding tiles until areaDebt is paid down.
     * This is used for both initial population and refilling.
     */
    private fillDebt(): void {
        while (this.areaDebt > 0) {
            // Random radius from centralized generator
            const r = TileGenerator.getRandomRadius(this.random);

            // Add tile
            this.addTile(r);

            // Subtract area from debt
            this.areaDebt -= Math.PI * r * r;
        }
    }

    /**
     * Call this to replenish tiles after some have been removed.
     * It relies on areaDebt being updated by the removal process.
     */
    refillLevel(): void {
        this.fillDebt();
    }

    isAdjacentTiles(tile1: Tile, tile2: Tile): boolean {
        // 1. Identity check
        if (tile1 === tile2) return false;

        // 2. Define the perpendicular bisector line L between tile1 (A) and tile2 (B)
        // Midpoint M
        const mx = (tile1.pos.x + tile2.pos.x) / 2;
        const my = (tile1.pos.y + tile2.pos.y) / 2;

        // Vector from A to B
        const dx = tile2.pos.x - tile1.pos.x;
        const dy = tile2.pos.y - tile1.pos.y;

        // Perpendicular vector U (direction of the bisector)
        // We rotate (dx, dy) by 90 degrees: (-dy, dx)
        const ux = -dy;
        const uy = dx;

        // The bisector is a parameterized line: P(t) = M + t * U
        // We maintain a valid interval [tMin, tMax] for t.
        // Initially, the edge could be infinitely long in both directions.
        let tMin = Number.NEGATIVE_INFINITY;
        let tMax = Number.POSITIVE_INFINITY;

        // Pre-calculate squared distance from Midpoint to Tile1 (same as to Tile2)
        // This represents the radius of the empty circle at the midpoint.
        const distRadSq = (mx - tile1.pos.x) ** 2 + (my - tile1.pos.y) ** 2;

        // 3. Clip the line against every other tile
        for (const tile of this.tiles) {
            if (tile === tile1 || tile === tile2) continue;

            // We need to determine how 'tile' (C) constrains the line L.
            // The condition for the edge to exist is: dist(P(t), A) < dist(P(t), C)

            // This simplifies to a linear inequality: t * coeff > rhs

            // coeff = 2 * ((A - C) dot U)
            const acx = tile1.pos.x - tile.pos.x;
            const acy = tile1.pos.y - tile.pos.y;
            const coeff = 2 * (acx * ux + acy * uy);

            // rhs = |M - A|^2 - |M - C|^2
            const distToCSq = (mx - tile.pos.x) ** 2 + (my - tile.pos.y) ** 2;
            const rhs = distRadSq - distToCSq;

            // Check for collinearity or near-collinearity (floating point safety)
            if (Math.abs(coeff) < 1e-9) {
                // The bisector of AC is parallel to our line L.
                // If RHS >= 0, it means M is closer to C than to A (or equal).
                // Since the lines are parallel, C blocks the ENTIRE edge.
                if (rhs >= 0) return false;
                // If RHS < 0, C is 'behind' A and doesn't affect the boundary.
            } else {
                const cut = rhs / coeff;

                if (coeff > 0) {
                    // Constraint is t > cut
                    if (cut > tMin) tMin = cut;
                } else {
                    // Constraint is t < cut
                    if (cut < tMax) tMax = cut;
                }
            }

            // Optimization: If the valid interval closes, the tiles are not neighbors.
            if (tMin >= tMax) return false;
        }

        // If a valid interval remains, the tiles share a Voronoi edge.
        return true;
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

                // Sum up the sizes for refill (Area = PI * r^2)
                this.areaDebt += Math.PI * tile.size * tile.size;

                // Increment collectedTiles count for this color
                const prevCount = this.collectedTiles.get(tile.colorID) ?? 0;
                this.collectedTiles.set(tile.colorID, prevCount + 1);
            }

            this.selectedTiles = [];

            // Refill using the total size of removed tiles
            this.refillLevel();
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
