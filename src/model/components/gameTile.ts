// components/GameTile.ts
import { Tile } from "../types/tile";
import { ColorNumber } from "../types/color";

export class GameTile implements Tile {
    pos: { x: number; y: number };
    vel: { x: number; y: number };
    size: number;
    colorID: ColorNumber;
    isHighlighted: boolean;

    constructor(
        pos: { x: number; y: number },
        vel: { x: number; y: number },
        size: number,
        colorID: ColorNumber,
        isHighlighted: boolean = false
    ) {
        this.pos = pos;
        this.vel = vel;
        this.size = size;
        this.colorID = colorID;
        this.isHighlighted = isHighlighted;
    }

    /**
     * Determines if the other tile is the same color as this tile.
     *
     * @param other is the other tile
     */
    isSameColor(other: Tile): boolean {
        return this.colorID === other.colorID;
    }

    /**
     * Determines the distance between this tile and the other tile.
     *
     * @param other is the other tile
     */
    distance(other: Tile): number {
        const dx = this.pos.x - other.pos.x;
        const dy = this.pos.y - other.pos.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    clone(): Tile {
        return new GameTile(
            { ...this.pos },
            { ...this.vel },
            this.size,
            this.colorID,
            this.isHighlighted
        );
    }
}
