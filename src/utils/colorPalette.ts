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
     * Check if a color index is valid (within current palette bounds)
     */
    isValidIndex(index: number): boolean {
        return index >= 0 && index < this.colors.length;
    }

    // ─────────────────────────────────────────────────────────────
    // Setters
    // ─────────────────────────────────────────────────────────────

    /**
     * Set a color at a specific index.
     * Index must be within current palette bounds.
     */
    setColor(index: number, color: ColorEntry): void {
        if (index < 0 || index >= this.colors.length) {
            console.warn(`ColorPalette: Cannot set color at index ${index}, palette size is ${this.colors.length}`);
            return;
        }
        this.colors[index] = color;
        this.notifyChange();
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
            console.warn(`ColorPalette: Cannot add color, palette is at max capacity (${this.maxColors})`);
            return -1;
        }
        this.colors.push(color);
        this.notifyChange();
        return this.colors.length - 1;
    }

    /**
     * Remove a color from the palette by index.
     * Note: This will shift all subsequent color indices down by 1,
     * which may affect tiles using those colors.
     */
    removeColor(index: number): void {
        if (index < 0 || index >= this.colors.length) {
            console.warn(`ColorPalette: Cannot remove color at index ${index}, palette size is ${this.colors.length}`);
            return;
        }

        // Don't allow removing the last color
        if (this.colors.length === 1) {
            console.warn(`ColorPalette: Cannot remove last color from palette`);
            return;
        }

        this.colors.splice(index, 1);
        this.notifyChange();
    }

    // ─────────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────────

    /**
     * Convert a hex color string to WebGL color values (0-1 range).
     */
    static hexToGL(hex: string): [number, number, number] {
        // Remove # if present
        const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;

        const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
        const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
        const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

        return [r, g, b];
    }

    /**
     * Convert WebGL color values (0-1 range) to a hex color string.
     */
    static glToHex(gl: [number, number, number]): string {
        const r = Math.round(gl[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(gl[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(gl[2] * 255).toString(16).padStart(2, '0');

        return `#${r}${g}${b}`;
    }

    /**
     * Create a ColorEntry from a hex string.
     */
    static fromHex(hex: string): ColorEntry {
        return {
            gl: ColorPalette.hexToGL(hex),
            css: hex.startsWith('#') ? hex : `#${hex}`
        };
    }

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

    /**
     * Find the palette index of the color closest to the given RGB values.
     * Uses simple Euclidean distance in RGB space.
     * 
     * @param r Red component (0-255)
     * @param g Green component (0-255)  
     * @param b Blue component (0-255)
     * @returns Index of the closest color in the palette
     */
    findClosestColor(r: number, g: number, b: number): number {
        if (this.colors.length === 0) return 0;

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
