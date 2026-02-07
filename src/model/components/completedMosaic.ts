import {Mosaic} from "../types/mosaic";
import {Tile} from "../types/tile";
import {ColorNumber} from "../types/color";

export class CompletedMosaic implements Mosaic {
    name: string;
    tiles: Tile[];

    constructor(name: string, tiles: Tile[]) {
        this.name = name;
        this.tiles = tiles;
    }

    getWinTiles(): Map<ColorNumber, number> {
        const winTiles = new Map<ColorNumber, number>();
        for (const tile of this.tiles) {
            const count = winTiles.get(tile.colorID) || 0;
            winTiles.set(tile.colorID, count + 1);
        }
        return winTiles;
    }
}
