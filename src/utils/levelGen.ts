import { Tile } from "../model/types/tile";
import { GameTile } from "../model/components/gameTile";
import { palette } from "./constants.ts";
import { mb32 } from "./random.ts";
import { ColorNumber } from "../model/types/color";
import { TileGenerator } from "../model/logic/TileGenerator";
import { viewport } from "./viewport.ts";

const PADDING = 2;       // Spacing between balls
const MAX_FAILURES = 1000;  // How many times to try placing a tile before giving up

export function generateLevel(seed?: number): Tile[] {
    const random = seed !== undefined ? mb32(seed) : Math.random;
    const tiles: Tile[] = [];

    let currentArea = 0;
    const targetArea = TileGenerator.getTargetDensity();
    let failures = 0;

    // Use a safety break to prevent infinite loops
    let attempts = 0;
    const MAX_ATTEMPTS = 10000;

    while (currentArea < targetArea && failures < MAX_FAILURES && attempts < MAX_ATTEMPTS) {
        attempts++;

        const radius = TileGenerator.getRandomRadius(random);
        const doubleHeight = viewport.height * 2;

        // Random Position
        const x = random() * (viewport.width - radius * 2) + radius;
        const y = random() * ((doubleHeight) - radius * 2) + radius;

        // Check Overlaps
        let overlapping = false;

        // Safety check: Don't spawn inside walls if window is small
        if (x < radius || x > viewport.width - radius || y < radius || y > doubleHeight - radius) {
            overlapping = true;
        } else {
            for (const existing of tiles) {
                const dx = existing.pos.x - x;
                const dy = existing.pos.y - y;
                const distSq = dx * dx + dy * dy;

                const minDist = existing.size + radius + PADDING;

                if (distSq < minDist * minDist) {
                    overlapping = true;
                    break;
                }
            }
        }

        // Place or Fail
        if (!overlapping) {
            // Success! We found a spot.
            tiles.push(new GameTile(
                { x, y },
                { x: 0, y: 0 },
                radius,
                Math.floor(random() * palette.length) as ColorNumber
            ));

            currentArea += Math.PI * radius * radius;
            // Reset failure count because we successfully placed one
            failures = 0;
        } else {
            // Failure! We hit another tile.
            failures++;
        }
    }

    return tiles;
}
