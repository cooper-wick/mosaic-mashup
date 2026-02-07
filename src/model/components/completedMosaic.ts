import { Mosaic } from "../types/mosaic";
import { Tile } from "../types/tile";
import { ColorNumber } from "../types/color";

export class CompletedMosaic implements Mosaic {
    name: string;
    width: number;
    height: number;
    tiles: Tile[];

    constructor(name: string, width: number, height: number, tiles: Tile[]) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.tiles = tiles;
    }

    getWinTiles(): Map<ColorNumber, number> {
        const winTiles = new Map<ColorNumber, number>();
        for (const tile of this.tiles) {
            const count = winTiles.get(tile.colorID) || 0;
            winTiles.set(tile.colorID, count + 0.1);
        }
        // Make sure each is a min of 1 and round to nearest whole number
        winTiles.forEach((value, key) => {
            const roundedValue = Math.round(value);
            winTiles.set(key, roundedValue < 1 ? 1 : roundedValue);
        });
        return winTiles;
    }
}
