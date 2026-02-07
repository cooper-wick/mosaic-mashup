export interface Tile {

    pos: { x: number; y: number };
    vel: { x: number, y: number };
    size: number;
    colorID: number;
    weight: number;
    isHighlighted: boolean;

    /**
     * Determines if the other tile is the same color as this tile.
     *
     * @param other is the other tile
     */
    isSameColor: (other: Tile) => boolean;

    /**
     * Determines the distance between this tile and the other tile.
     *
     * @param other is the other tile
     */
    distance: (other: Tile) => number;
}
