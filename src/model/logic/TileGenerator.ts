import { viewport } from "../../utils/viewport";

export class TileGenerator {
    /**
     * Calculates a random radius appropriate for the current viewport size.
     * Uses the screen diagonal as a reference scale.
     */
    static getRandomRadius(random: () => number = Math.random): number {
        const diag = Math.sqrt(viewport.width ** 2 + viewport.height ** 2);

        // Base scale relative to screen diagonal
        // Min Radius: ~2.5% of diagonal
        // Max Radius: ~4.5% of diagonal
        const minRadius = diag * 0.025;
        const maxRadius = diag * 0.045;

        return minRadius + random() * (maxRadius - minRadius);
    }

    /**
     * Returns the target area density for the level (e.g., 60% of screen filled).
     */
    static getTargetDensity(): number {
        return viewport.width * viewport.height * 0.95;
    }
}
