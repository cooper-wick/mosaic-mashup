/**
 * ColorPalette - Centralized color management for the mosaic game.
 *
 * Provides a dynamic color palette that can be modified at runtime,
 * with change notifications for GPU shader updates.
 */

export interface ColorEntry {
    /** WebGL color values (0-1 range) */
    gl: [number, number, number];
    /** CSS hex color string (e.g., "#ff0000") */
    css: string;
}

export class ColorPalette {
    private colors: ColorEntry[] = [];
    private readonly maxColors: number;
    private changeListeners: Set<() => void> = new Set();

    /** Default fallback color (gray) used when palette is empty or index is invalid */
    private static readonly FALLBACK_COLOR: ColorEntry = {
        gl: [0.5, 0.5, 0.5],
        css: "#808080"
    };

    constructor(maxColors: number = 16) {
        this.maxColors = maxColors;
    }

    // ─────────────────────────────────────────────────────────────
    // Getters
    // ─────────────────────────────────────────────────────────────

    /** Number of colors currently in the palette */
    get length(): number {
        return this.colors.length;
    }

    /** Maximum number of colors this palette can hold */
    get max(): number {
        return this.maxColors;
    }

    /** Read-only array of all color entries */
    get entries(): ReadonlyArray<ColorEntry> {
        return this.colors;
    }

    /**
     * Get a color by index with graceful fallback.
     * Returns the first color if index is out of bounds, or a gray fallback if palette is empty.
     */
    getColor(index: number): ColorEntry {
        if (this.colors.length === 0) {
            return ColorPalette.FALLBACK_COLOR;
        }

        // Clamp index to valid range
        const safeIndex = Math.max(0, Math.min(index, this.colors.length - 1));
        return this.colors[safeIndex];
    }

    /**
     * Replace the entire palette with new colors.
     * Truncates to maxColors if necessary.
     */
    setColors(colors: ColorEntry[]): void {
        this.colors = colors.slice(0, this.maxColors);
        this.notifyChange();
    }

    /**
     * Add a new color to the palette.
     * Returns the index of the new color, or -1 if palette is full.
     */
    addColor(color: ColorEntry): number {
        if (this.colors.length >= this.maxColors) {
            return -1;
        }
        this.colors.push(color);
        this.notifyChange();
        return this.colors.length - 1;
    }

    // ─────────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────────

    /**
     * Find an existing color within the threshold, or add a new one if space permits.
     *
     * @param r Red component (0-255)
     * @param g Green component (0-255)
     * @param b Blue component (0-255)
     * @param thresholdSq Squared Euclidean distance threshold (default: 2500, approx 50 unit distance)
     * @returns Index of the found or added color
     */
    findOrAddColor(r: number, g: number, b: number, thresholdSq: number = 2500): number {
        if (this.colors.length === 0) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            return this.addColor({
                gl: [r / 255, g / 255, b / 255],
                css: hex
            });
        }

        let minDist = Infinity;
        let bestIndex = 0;

        for (let i = 0; i < this.colors.length; i++) {
            const color = this.colors[i];

            // Parse hex to RGB for comparison
            const hex = color.css;
            const pr = parseInt(hex.slice(1, 3), 16);
            const pg = parseInt(hex.slice(3, 5), 16);
            const pb = parseInt(hex.slice(5, 7), 16);

            const dr = r - pr;
            const dg = g - pg;
            const db = b - pb;
            const dist = dr * dr + dg * dg + db * db;

            if (dist < minDist) {
                minDist = dist;
                bestIndex = i;
            }
        }

        // If the closest color is within the threshold, reuse it
        if (minDist <= thresholdSq) {
            return bestIndex;
        }

        // Otherwise, try to add the new color
        if (this.colors.length < this.maxColors) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            return this.addColor({
                gl: [r / 255, g / 255, b / 255],
                css: hex
            });
        }

        // If palette is full, return the closest match
        return bestIndex;
    }

    // ─────────────────────────────────────────────────────────────
    // Change Notifications
    // ─────────────────────────────────────────────────────────────

    /**
     * Subscribe to palette change notifications.
     * Returns an unsubscribe function.
     */
    onChange(listener: () => void): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    /**
     * Notify all listeners that the palette has changed.
     */
    private notifyChange(): void {
        for (const listener of this.changeListeners) {
            listener();
        }
    }
}
