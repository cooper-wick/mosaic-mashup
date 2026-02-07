import {Tile} from "./model/types/tile";

// Physics tuning for stability
export const GRAVITY = 8000;      // Stronger gravity helps settle stacks firmly
export const DAMPING = 0.99;     // High air resistance slows chaos
export const RESTITUTION = 0.10; // Low bounciness prevents jittering
export const SUBSTEPS = 30;       // Calculate physics 8 times per frame for precision
export const SETTLE_THRESH = 0.5;
export const FRICTION = 0.9;     // Surface friction to stop sliding

/**
 * Advances the physics simulation.
 * Uses sub-stepping for stability and impulse-based friction for stacking.
 */
export function stepTiles(tiles: Tile[], W: number, H: number): void {
    // We break the 1/60th of a second frame into smaller chunks
    // This allows force to travel through the stack in a single frame
    const dt = (1 / 60) / SUBSTEPS;

    for (let step = 0; step < SUBSTEPS; step++) {

        // Apply forces and integrate motion
        for (const tile of tiles) {
            tile.vel.y += GRAVITY * dt;
            tile.pos.x += tile.vel.x * dt;
            tile.pos.y += tile.vel.y * dt;

            // Apply air resistance to calm the overall energy
            tile.vel.x *= DAMPING;
            tile.vel.y *= DAMPING;
        }

        // Resolve pairwise collisions
        for (let i = 0; i < tiles.length; i++) {
            const a = tiles[i];

            for (let j = i + 1; j < tiles.length; j++) {
                const b = tiles[j];

                const dx = b.pos.x - a.pos.x;
                const dy = b.pos.y - a.pos.y;
                const distSq = dx * dx + dy * dy;

                const minDist = a.size + b.size;

                // Skip if not touching
                if (distSq >= minDist * minDist || distSq === 0) continue;

                const dist = Math.sqrt(distSq);

                // Calculate collision normal
                const nx = dx / dist;
                const ny = dy / dist;

                // 1. Position Correction (The most important part for stacking)
                // We physically push the balls apart so they don't overlap
                const overlap = minDist - dist;
                const totalMass = (a.weight || 1) + (b.weight || 1);
                const rA = (b.weight || 1) / totalMass; // Ratio for A
                const rB = (a.weight || 1) / totalMass; // Ratio for B

                a.pos.x -= nx * overlap * rA;
                a.pos.y -= ny * overlap * rA;
                b.pos.x += nx * overlap * rB;
                b.pos.y += ny * overlap * rB;

                // 2. Velocity Resolution (Bounce and Friction)
                const relVelX = b.vel.x - a.vel.x;
                const relVelY = b.vel.y - a.vel.y;

                // Calculate velocity along the normal
                const velAlongNormal = relVelX * nx + relVelY * ny;

                // Only resolve if objects are moving towards each other
                if (velAlongNormal < 0) {
                    // Calculate bounce impulse
                    const j = -(1 + RESTITUTION) * velAlongNormal;

                    const impulseX = j * nx;
                    const impulseY = j * ny;

                    a.vel.x -= impulseX * rA;
                    a.vel.y -= impulseY * rA;
                    b.vel.x += impulseX * rB;
                    b.vel.y += impulseY * rB;

                    // Calculate Friction (Tangential force)
                    // This stops balls from sliding off the top of the stack
                    const tx = -ny;
                    const ty = nx;
                    const velAlongTangent = relVelX * tx + relVelY * ty;

                    // Apply friction impulse against the tangent
                    const frictionImpulse = velAlongTangent * (1 - FRICTION);

                    a.vel.x += tx * frictionImpulse * rA;
                    a.vel.y += ty * frictionImpulse * rA;
                    b.vel.x -= tx * frictionImpulse * rB;
                    b.vel.y -= ty * frictionImpulse * rB;
                }
            }
        }

        // Resolve wall collisions
        for (const tile of tiles) {
            const r = tile.size;

            // Left Wall
            if (tile.pos.x < r) {
                tile.pos.x = r;
                tile.vel.x *= -RESTITUTION;
                tile.vel.y *= FRICTION; // Friction against wall
            }

            // Right Wall
            if (tile.pos.x > W - r) {
                tile.pos.x = W - r;
                tile.vel.x *= -RESTITUTION;
                tile.vel.y *= FRICTION; // Friction against wall
            }

            // Floor
            if (tile.pos.y > H - r) {
                tile.pos.y = H - r;
                tile.vel.y *= -RESTITUTION;
                tile.vel.x *= FRICTION; // Friction against floor prevents sliding
            }

            // Ceiling safety check (prevents balls escaping up)
            if (tile.pos.y < -500) {
                tile.pos.y = -500;
                tile.vel.y = 0;
            }
        }
    }
}

export function areTilesSettled(tiles: Tile[]): boolean {
    for (const tile of tiles) {
        // We check if the velocity is effectively zero
        if (
            Math.abs(tile.vel.x) > SETTLE_THRESH ||
            Math.abs(tile.vel.y) > SETTLE_THRESH
        ) {
            return false;
        }
    }
    return true;
}
