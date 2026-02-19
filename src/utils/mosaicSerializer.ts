import { CompletedMosaic } from "../model/components/completedMosaic";
import { GameTile } from "../model/components/gameTile";
import { Tile } from "../model/types/tile";
import { palette } from "./constants";
import { ColorNumber } from "../model/types/color";

export class MosaicSerializer {
    /**
     * Serializes a CompletedMosaic into a string.
     * Format: name|width|height|#HEX-localID|...||localID,x,y|...
     */
    static serialize(mosaic: CompletedMosaic): string {
        // Build a local color map: globalColorID -> localID
        const globalToLocal = new Map<number, number>();
        const colorDefs: string[] = [];

        for (const tile of mosaic.tiles) {
            const gid = tile.colorID as number;
            if (!globalToLocal.has(gid)) {
                const localID = globalToLocal.size;
                globalToLocal.set(gid, localID);
                const entry = palette.getColor(gid);
                colorDefs.push(`${entry.css}-${localID}`);
            }
        }

        const header = [mosaic.name, mosaic.width, mosaic.height, ...colorDefs].join("|");
        const body = mosaic.tiles
            .map(t => `${globalToLocal.get(t.colorID as number)},${t.pos.x},${t.pos.y}`)
            .join("|");

        return `${header}||${body}`;
    }

    /**
     * Deserializes a string back into a CompletedMosaic.
     */
    static deserialize(data: string, scalar: number = 1): CompletedMosaic {
        try {
            const parts = data.split("||");
            if (parts.length < 2) {
                // Handle case with no tiles? Format mandates ||.
                // If body is empty, it might end with ||
                if (data.endsWith("||")) {
                    // Valid header, empty body
                } else {
                    throw new Error("Invalid format: missing body separator '||'");
                }
            }

            const headerStr = parts[0];
            const bodyStr = parts[1];

            const headerParts = headerStr.split("|");
            const name = headerParts[0];

            let width = 1000;
            let height = 1000;
            let colorStartIndex = 1;

            const w = parseInt(headerParts[1]);
            const h = parseInt(headerParts[2]);

            // Simple heuristic: if headerParts[1] is a number and NOT a hex color (doesn't start with #)
            if (!isNaN(w) && !isNaN(h) && !headerParts[1].startsWith("#")) {
                width = w;
                height = h;
                colorStartIndex = 3;
            }

            // Parse color definitions: Hex-ID
            // Determine mapping: Local ID -> Global ID
            const localToGlobal = new Map<number, number>();

            for (let i = colorStartIndex; i < headerParts.length; i++) {
                const def = headerParts[i];
                // format: #RRGGBB-ID or RRGGBB-ID
                const lastDash = def.lastIndexOf("-");
                if (lastDash === -1) continue;

                const hex = def.substring(0, lastDash);
                const localID = parseInt(def.substring(lastDash + 1));

                if (isNaN(localID)) continue;

                // Find or add to global palette
                const gl = palette.findOrAddColor(
                    parseInt(hex.replace("#", "").substring(0, 2), 16),
                    parseInt(hex.replace("#", "").substring(2, 4), 16),
                    parseInt(hex.replace("#", "").substring(4, 6), 16)
                );

                localToGlobal.set(localID, gl);
            }

            // Parse tiles
            const tiles: Tile[] = [];
            if (bodyStr && bodyStr.length > 0) {
                const tileDefs = bodyStr.split("|");
                for (const def of tileDefs) {
                    // format: ID,x,y
                    const coords = def.split(",");
                    if (coords.length !== 3) continue;

                    const localID = parseInt(coords[0]);
                    const x = parseFloat(coords[1]);
                    const y = parseFloat(coords[2]);

                    const globalID = localToGlobal.get(localID);
                    // If globalID is undefined (maybe malformed file), fallback to 0 or skip?
                    // Let's fallback to 0.
                    const finalColorID: ColorNumber = (globalID !== undefined ? globalID : 0) as ColorNumber;

                    const tile = new GameTile(
                        { x, y },
                        { x: 0, y: 0 },
                        20, // Default size
                        finalColorID
                    );
                    tiles.push(tile);
                }
            }

            return new CompletedMosaic(name, width, height, tiles, scalar);

        } catch (e) {
            throw e;
        }
    }
}
