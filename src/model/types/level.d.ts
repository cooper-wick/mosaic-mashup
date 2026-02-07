export interface Level {
    randomSeed: number;
    tiles: Tile[];
    winTiles: Map<number, number>;
    collectedTiles: Map<number, Tile>;
    selectedTiles: Tile[];

    /**
     * Determines if the entire screen is full of tiles.
     */
    isLevelFull: () => boolean;

    /**
     * Generates a new tile using randomSeed, and adds it into the level.
     */
    addTile: () => void;

    /**
     * While level is not full, generates new tiles and adds them into the level.
     */
    fillLevel: () => void;

    /**
     * Determines if the given tiles are adjacent.
     *
     * @param tile1 is the first tile
     * @param tile2 is the second tile
     */
    isAdjacentTiles: (tile1: Tile, tile2: Tile) => boolean;

    /**
     * Decides whether which tiles are selected based on the previous and current tile selections,
     * and updates selectedTiles accordingly.
     *
     * if @prev.color != @curr.color, then we ignore the selection
     *
     * @prev == @curr => the player has not moved tiles
     * @prev != @curr && @curr NOT IN selectedTiles => the player has selected a new tile, add it to selectedTiles
     * @prev != @curr && @curr == selectedTiles[n - 1] => nth tile was deselected, remove it
     *
     * @param prev is the previous tile
     * @param curr is the current tile
     */
    processTileSelection: (prev: Tile, curr: Tile) => void;

    /**
     * Removes the selected tiles from the level, adds them to collected tiles.
     * Generates new tiles to fill the screen back up.
     *
     * If the connection is of length == 1, deselect the tile
     */
    finalizeConnection: () => void;

    /**
     * Determines if the player has won the game by checking if all win tiles have been collected.
     */
    isGameWon: () => boolean;
}
