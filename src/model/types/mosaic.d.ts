import {ColorNumber} from "./color";

export interface Mosaic {
    name: string;
    tiles: Tile[];
    getWinTiles: () => Map<ColorNumber, number>;

}
