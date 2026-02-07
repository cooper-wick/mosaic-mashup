import {Tile} from "./model/types/tile";

export function tileAt(x: number, y: number, tiles: Tile[]): Tile | null {
    let best: Tile | null = null, bd = Infinity;
    for (const t of tiles) {
        const d = Math.hypot(x - t.pos.x, y - t.pos.y) / t.size;
        if (d < bd) { bd = d; best = t; }
    }
    return best;
}
