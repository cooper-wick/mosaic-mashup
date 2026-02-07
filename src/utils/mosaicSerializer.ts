import { CompletedMosaic } from "../model/components/completedMosaic";
import { GameTile } from "../model/components/gameTile";
import { Tile } from "../model/types/tile";
import { palette } from "./constants";
import { ColorNumber } from "../model/types/color";

export class MosaicSerializer {

    /**
     * Serializes a completed mosaic into a compressed string format.
     * Format: "Name"|Hex-ID|Hex-ID...||ID,x,y|ID,x,y...
     */
    static serialize(mosaic: CompletedMosaic): string {
        const usedColors = new Map<number, number>(); // Global ID -> Local ID
        const colorDefs: string[] = [];
        let nextLocalID = 0;

        for (const tile of mosaic.tiles) {
            const globalID = tile.colorID;
            if (!usedColors.has(globalID)) {
                const localID = nextLocalID++;
                usedColors.set(globalID, localID);

                // Get hex from global palette
                // Note: palette.getColor returns ColorEntry which has .css (hex)
                // In case of invalid ID, it returns fallback, which is fine.
                const colorEntry = palette.getColor(globalID);
                colorDefs.push(`${colorEntry.css}-${localID}`);
            }
        }

        const headerParts = [mosaic.name, ...colorDefs];
        const header = headerParts.join("|");

        // 2. Serialize tiles
        const tileStrings: string[] = mosaic.tiles.map(tile => {
            const localID = usedColors.get(tile.colorID);

            const x = Number(tile.pos.x.toFixed(1));
            const y = Number(tile.pos.y.toFixed(1));
            return `${localID},${x},${y}`;
        });

        const body = tileStrings.join("|");

        return `${header}||${body}`;
    }

    /**
     * Deserializes a string back into a CompletedMosaic.
     */
    static deserialize(data: string): CompletedMosaic {
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

            // Parse color definitions: Hex-ID
            // Determine mapping: Local ID -> Global ID
            const localToGlobal = new Map<number, number>();

            for (let i = 1; i < headerParts.length; i++) {
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

            return new CompletedMosaic(name, tiles);

        } catch (e) {
            console.error("Failed to deserialize mosaic:", e);
            throw e;
        }
    }
}
