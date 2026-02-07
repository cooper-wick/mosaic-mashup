import { ColorNumber } from "../model/types/color";
import { palette } from "./constants.ts";

/**
 * Generates a random color that is visually distinct from the given set of colors,
 * adds it to the global palette, and returns its ID.
 * Returns null if the palette is full.
 */
export function addDistinctColor(existingColors: ColorNumber[], random: () => number = Math.random): ColorNumber | null {
    if (palette.length >= palette.max) {
        console.warn("Palette is full, cannot add distinct color.");
        return null; // Or return an existing one?
    }

    const MAX_ATTEMPTS = 50;
    let bestColor: { r: number, g: number, b: number } | null = null;
    let maxMinDist = -1;

    // Existing colors as RGB
    const existingRGBs = existingColors.map(id => {
        const c = palette.getColor(id);
        return hexToRgb(c.css);
    });

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const r = Math.floor(random() * 256);
        const g = Math.floor(random() * 256);
        const b = Math.floor(random() * 256);

        let minDist = Number.MAX_VALUE;
        if (existingRGBs.length === 0) {
            minDist = 255 * 3; // Max possible
        } else {
            for (const existing of existingRGBs) {
                const dist = colorDistance({ r, g, b }, existing);
                if (dist < minDist) {
                    minDist = dist;
                }
            }
        }

        // We want to maximize the minimum distance to any existing color
        if (minDist > maxMinDist) {
            maxMinDist = minDist;
            bestColor = { r, g, b };
        }
    }

    if (bestColor) {
        // Add checks for absolute minimum distinction threshold?
        // For now, maximizing distance is good enough strategy.
        return palette.findOrAddColor(bestColor.r, bestColor.g, bestColor.b);
    }

    return null;
}


function hexToRgb(hex: string): { r: number, g: number, b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function colorDistance(c1: { r: number, g: number, b: number }, c2: { r: number, g: number, b: number }): number {
    return Math.sqrt(
        (c1.r - c2.r) ** 2 +
        (c1.g - c2.g) ** 2 +
        (c1.b - c2.b) ** 2
    );
}
