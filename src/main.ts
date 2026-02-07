import './style.css'
import { stepTiles } from "./physics.ts";
import { initGL, render, resizeGL } from "./shaders/rendering.ts";
import { updateViewportSize, viewport } from "./utils/viewport.ts";
import { tileAt } from "./gameLogic.ts";
import { GameLevel } from "./model/components/gameLevel.ts";
import { PALETTE } from "./utils/constants.ts";
import {generateLevel} from "./utils/levelGen.ts";
import {CompletedMosaic} from "./model/components/completedMosaic.ts";


const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
const olCanvas = document.getElementById("overlay") as HTMLCanvasElement;

const olCtx = olCanvas.getContext("2d")!;
const glCtx = initGL(glCanvas);

// TODO: THIS IS A HACK TO GET THE SIZE! CHANGE
olCanvas.width = viewport.width;
olCanvas.height = viewport.height;

// Initialize balls

const tiles = generateLevel(0);
const completedMosaic = new CompletedMosaic("test", tiles);
const level = new GameLevel(completedMosaic);
level.tiles = tiles;

function updateRequirementDisplay() {
    const container = document.getElementById("tile-requirements");
    if (!container) return;

    container.innerHTML = "";

    for (const [colorID, required] of level.winTiles.entries()) {
        console.log(level.collectedTiles)
        const collected = level.collectedTiles.get(colorID) || 0;

        const remaining = required - collected;
        const el = document.createElement("div");
        el.className = "tile-count";

        const dot = document.createElement("div");
        dot.className = "tile-dot";
        dot.style.backgroundColor = PALETTE[colorID].css;

        const text = document.createElement("span");
        text.textContent = remaining > 0 ? remaining.toString() : "✓";

        el.appendChild(dot);
        el.appendChild(text);
        container.appendChild(el);
    }
}

updateRequirementDisplay();

let isDragging = false;

function animate() {
    if (!olCtx || !glCtx) return;

    // Clear the canvas (prevents "trails" from forming)
    olCtx.clearRect(0, 0, viewport.width, viewport.height);

    // console.log(level.tiles.reduce((acc, tile) => acc + tile.size, 0));

    // console.log(level.isGameWon())
    // if (level.isGameWon()) {
    //     olCtx.fillStyle = "rgba(0, 0, 0, 1)";
    //     // level.tiles.forEach((tile, i) => {
    //     //     tile.pos.y += 1; // Move upwards
    //     // })
    // } else {
        stepTiles(level.tiles, viewport.width, viewport.height);
    // }

    render(glCtx, level.tiles);


    // Request the next frame
    requestAnimationFrame(animate);
}

// Initialization
if (olCanvas && olCtx) {
    olCanvas.width = window.innerWidth;
    olCanvas.height = window.innerHeight;

    window.addEventListener("keypress", () => {
        stepTiles(level.tiles, viewport.width, viewport.height);
    });

    const handleStart = (x: number, y: number) => {
        const tile = tileAt(x, y, level.tiles);

        if (tile) {
            isDragging = true;
            // Clear previous highlighting just in case, though finalize should have handled it
            // Initiating new selection
            if (level.selectedTiles.length > 0) {
                // Should have been cleared, but safety first?
                // Actually finalizeConnection clears it.
            }
            level.selectedTiles = [tile];
            tile.isHighlighted = true;
        }
    };

    const handleMove = (x: number, y: number) => {
        if (!isDragging) return;

        const tile = tileAt(x, y, level.tiles);

        if (tile) {
            const prev = level.selectedTiles[level.selectedTiles.length - 1];
            // Only process if we have a previous tile (which we should if dragging started correctly)
            if (prev) {
                level.processTileSelection(prev, tile);
            }
        }
    };

    const handleEnd = () => {
        if (isDragging) {
            isDragging = false;
            level.finalizeConnection();
            updateRequirementDisplay();
        }
    };

    window.addEventListener("mousedown", (e) => {
        handleStart(e.clientX, e.clientY);
    });

    window.addEventListener("touchstart", (e) => {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
    });

    window.addEventListener("mousemove", (e) => {
        handleMove(e.clientX, e.clientY);
    });

    window.addEventListener("touchmove", (e) => {
        e.preventDefault(); // Prevent scrolling
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    });

    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchend", handleEnd);



    // Handle resizing
    window.addEventListener('resize', () => {
        // Update the Source of Truth
        updateViewportSize();

        // Update Overlay Canvas
        olCanvas.width = viewport.width;
        olCanvas.height = viewport.height;

        // Update WebGL (Canvas size, Viewport, and Uniforms)
        resizeGL(glCtx);
    });

    // Start the loop
    animate();
}
