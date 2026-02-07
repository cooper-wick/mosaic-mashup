import { Tile } from "../model/types/tile";
import { GameTile } from "../model/components/gameTile";
import { NUM_COLORS } from "./constants.ts";

const PADDING = 2;       // Spacing between balls
const START_R = 95;      // Start with huge balls
const END_R = 35;        // Keep going until we are placing tiny balls
const FAIL_LIMIT = 50;  // How many times to fail before we shrink the size

export function generateLevel(): Tile[] {
    const tiles: Tile[] = [];

    let currentMaxR = START_R;
    let failures = 0;

    while (currentMaxR >= END_R) {

        const radius = currentMaxR * (0.8 + Math.random() * 0.2);

        if (radius < END_R) break;

        const doubleHeight = window.innerHeight * 2;

        // Random Position
        const x = Math.random() * (window.innerWidth - radius * 2) + radius;
        const y = Math.random() * ((doubleHeight) - radius * 2) + radius;

        // Check Overlaps
        let overlapping = false;

        // Safety check: Don't spawn inside walls if window is small
        if (x < radius || x > window.innerWidth - radius || y < radius || y > doubleHeight - radius) {
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
                Math.floor(Math.random() * NUM_COLORS),
                radius
            ));

            // Reset failure count because we successfully placed one
            failures = 0;
        } else {
            // Failure! We hit another ball.
            failures++;

            // If we fail too many times in a row, it means the screen is
            // full of balls at this size. It's time to shrink!
            if (failures > FAIL_LIMIT) {
                currentMaxR *= 0.95; // Shrink our target size by 5%
                failures = 0;        // Reset counter for the new smaller size
            }
        }
    }

    return tiles;
}
