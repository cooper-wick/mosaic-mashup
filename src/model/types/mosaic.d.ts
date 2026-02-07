import { ColorNumber } from "./color";

export interface Mosaic {
    name: string;
    width: number;
    height: number;
    tiles: Tile[];
    getWinTiles: () => Map<ColorNumber, number>;

}
