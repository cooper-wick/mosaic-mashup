import { ColorPalette, ColorEntry } from './colorPalette.ts';

export const MAX_SEEDS = 1000;      // Max number of tiles (safety limit)
export const MAX_PALETTE_SIZE = 16; // Maximum colors the GPU shader supports

// Default color palette
const DEFAULT_COLORS: ColorEntry[] = [
    { gl: [0.93, 0.32, 0.28], css: "#ed5247" },
    { gl: [0.22, 0.62, 0.89], css: "#389ee3" },
    { gl: [0.20, 0.82, 0.48], css: "#33d17a" },
    { gl: [0.97, 0.78, 0.10], css: "#f8c71a" },
    { gl: [0.62, 0.32, 0.75], css: "#9e52bf" },
];

// Global palette singleton
export const palette = new ColorPalette(MAX_PALETTE_SIZE);
palette.setColors(DEFAULT_COLORS);

// ─────────────────────────────────────────────────────────────
// Legacy exports for backward compatibility
// ─────────────────────────────────────────────────────────────

/** @deprecated Use `palette.entries` instead */
export const PALETTE = palette.entries;

/** @deprecated Use `palette.length` instead */
export function getNumColors(): number {
    return palette.length;
}

// For compile-time usage in shaders (uses max size, not current size)
export const NUM_COLORS = MAX_PALETTE_SIZE;
