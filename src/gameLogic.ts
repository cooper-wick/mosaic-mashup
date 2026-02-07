import {Tile} from "./model/types/tile";

export function tileAt(x: number, y: number, tiles: Tile[]): Tile | null {
    let best: Tile | null = null, bd = Infinity;
    for (const t of tiles) {
        const d = Math.hypot(x - t.pos.x, y - t.pos.y) / t.size;
        if (d < bd) { bd = d; best = t; }
    }
    return best;
}

export function adjacent(a: Tile, b: Tile, tiles: Tile[]): boolean {
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;

    // Fast fail if they are too far apart to be adjacent (more than 3.5 radii apart)
    if (Math.hypot(dx, dy) > (a.size + b.size) * 3.5) return false;
    const f = a.size / (a.size + b.size);
    const mx = a.pos.x + f * dx, my = a.pos.y + f * dy;
    const dA = Math.hypot(mx - a.pos.x, my - a.pos.y) / a.size;
    for (const c of tiles) {
        if (Math.hypot(mx - c.pos.x, my - c.pos.y) / c.size < dA - 0.02) return false;
    }
    return true;
}
