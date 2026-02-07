
import { Screen } from "../model/types/screen";
import { ScreenManager } from "./screenManager";
import { render, resizeGL, VoronoiContext } from "../shaders/rendering";
import { Tile } from "../model/types/tile";
import { GameTile } from "../model/components/gameTile";
import { tileAt } from "../gameLogic";
import { viewport } from "../utils/viewport";
import { palette } from "../utils/constants";
import { LobbyScreen } from "./lobbyScreen";

import { CompletedMosaic } from "../model/components/completedMosaic";
import { MosaicSerializer } from "../utils/mosaicSerializer";

export class DrawScreen implements Screen {
    private tiles: Tile[] = [];
    private backgroundImage: HTMLImageElement | null = null;
    private isDragging = false;
    private draggedTile: Tile | null = null;

    constructor(
        private manager: ScreenManager,
        private glCtx: VoronoiContext,
        private overlay: CanvasRenderingContext2D
    ) { }

    enter() {
        // Show draw controls
        const controls = document.getElementById("draw-controls");
        if (controls) controls.style.display = "flex";

        // Enable draw mode styling on GL canvas
        // Enable draw mode styling on GL canvas
        const glCanvas = document.getElementById("gl");
        if (glCanvas) glCanvas.classList.add("draw-mode");

        // Add body class for sidebar layout
        document.body.classList.add("draw-mode-active");
        // Trigger resize to update viewport
        window.dispatchEvent(new Event("resize"));

        // Disable context menu for right-click dragging
        window.addEventListener("contextmenu", this.handleContextMenu);

        // Setup button listeners
        const btnUpload = document.getElementById("btn-upload");
        const fileInput = document.getElementById("image-upload") as HTMLInputElement;
        const btnClear = document.getElementById("btn-clear");
        const btnBack = document.getElementById("btn-back");
        const btnExport = document.getElementById("btn-export");
        const btnImport = document.getElementById("btn-import");
        const txtData = document.getElementById("mosaic-data") as HTMLTextAreaElement;
        const txtName = document.getElementById("mosaic-name") as HTMLInputElement;

        if (btnUpload && fileInput) {
            btnUpload.onclick = () => fileInput.click();
            fileInput.onchange = (e) => this.handleImageUpload(e);
        }

        const btnMerge = document.getElementById("btn-merge");
        const txtMergeSrc = document.getElementById("merge-src") as HTMLInputElement;
        const txtMergeDest = document.getElementById("merge-dest") as HTMLInputElement;

        if (btnMerge && txtMergeSrc && txtMergeDest) {
            btnMerge.onclick = () => {
                const src = parseInt(txtMergeSrc.value);
                const dest = parseInt(txtMergeDest.value);

                if (isNaN(src) || isNaN(dest)) {
                    alert("Please enter valid Source and Destination Color IDs.");
                    return;
                }

                let count = 0;
                this.tiles.forEach(tile => {
                    if (tile.colorID === src) {
                        tile.colorID = dest;
                        count++;
                    }
                });

                alert(`merged ${count} tiles from color #${src} to #${dest}`);
            };
        }

        if (btnExport && txtData && txtName) {
            btnExport.onclick = () => {
                const name = txtName.value || "Untitled";
                const mosaic = new CompletedMosaic(name, this.tiles);
                const data = MosaicSerializer.serialize(mosaic);
                txtData.value = data;
                alert("Mosaic exported to text box!");
            };
        }

        if (btnImport && txtData) {
            btnImport.onclick = () => {
                try {
                    const data = txtData.value;
                    if (!data) return;
                    const mosaic = MosaicSerializer.deserialize(data);
                    this.tiles = mosaic.tiles;
                    if (txtName) txtName.value = mosaic.name;
                    alert("Mosaic imported!");
                } catch (e) {
                    alert("Failed to import mosaic: " + e);
                }
            };
        }

        if (btnClear) {
            btnClear.onclick = () => {
                this.tiles = [];
            };
        }

        if (btnBack) {
            btnBack.onclick = () => {
                this.manager.switch(new LobbyScreen(this.manager, this.glCtx, this.overlay));
            };
        }
    }

    exit() {
        const controls = document.getElementById("draw-controls");
        if (controls) controls.style.display = "none";

        // Cleanup background
        const bgLayer = document.getElementById("background-layer");
        if (bgLayer) bgLayer.style.backgroundImage = "";

        // Remove draw mode styling from GL canvas
        const glCanvas = document.getElementById("gl");
        if (glCanvas) glCanvas.classList.remove("draw-mode");

        // Remove body class
        document.body.classList.remove("draw-mode-active");
        // Trigger resize to reset viewport
        window.dispatchEvent(new Event("resize"));

        // Re-enable context menu
        window.removeEventListener("contextmenu", this.handleContextMenu);
    }

    private handleContextMenu = (e: Event) => {
        e.preventDefault();
    }

    update(_dt: number) {
        // No physics, but maybe simple animations later
    }

    render() {
        this.overlay.clearRect(0, 0, viewport.width, viewport.height);
        render(this.glCtx, this.tiles, true);

        // Draw dots at seed points
        const ctx = this.overlay;
        ctx.fillStyle = "black";
        for (const tile of this.tiles) {
            ctx.beginPath();
            ctx.arc(tile.pos.x, tile.pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    onResize() {
        resizeGL(this.glCtx);
    }

    private handleImageUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backgroundImage = img;
                    console.log(img)
                    console.log(e.target?.result)
                    const bgLayer = document.getElementById("background-layer");
                    if (bgLayer) {
                        bgLayer.style.backgroundImage = `url('${e.target?.result}')`;
                        bgLayer.style.backgroundSize = "contain";
                        bgLayer.style.backgroundRepeat = "no-repeat";
                        bgLayer.style.backgroundPosition = "center";
                    }
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    onPointerDown(x: number, y: number, event?: MouseEvent | TouchEvent) {
        // Prevent drawing if clicking on a UI element
        if (event && event.target instanceof HTMLElement) {
            const controls = document.getElementById("draw-controls");
            if (controls && (controls.contains(event.target as Node) || event.target.closest("#draw-controls"))) {
                return;
            }
            if (event.target.tagName === 'BUTTON') {
                return;
            }
        }

        // Right click to drag
        if (event instanceof MouseEvent && event.button === 2) {
            const tile = tileAt(x, y, this.tiles);
            if (tile) {
                this.isDragging = true;
                this.draggedTile = tile;
            }
            return;
        }

        if (!event || (event instanceof MouseEvent && event.button === 0)) {
            // Shift+Click to delete
            if (event instanceof MouseEvent && event.shiftKey) {
                const tileIndex = this.tiles.findIndex(t => {
                    const dx = t.pos.x - x;
                    const dy = t.pos.y - y;
                    return Math.sqrt(dx * dx + dy * dy) < t.size; // Simple hit test
                });

                if (tileIndex !== -1) {
                    this.tiles.splice(tileIndex, 1);
                    return; // Don't create a new tile
                }
            }

            // Check if we clicked on an existing tile? Maybe we want to select it?
            // For now, simple drawing: always add a new tile unless we are clearly dragging (processed above)

            // Sample color
            let colorID = 0; // Default
            if (this.backgroundImage) {
                colorID = this.sampleColor(x, y);
            } else {
                // If no image, pick a random color from palette
                colorID = Math.floor(Math.random() * palette.length);
            }

            const newTile = new GameTile(
                { x, y },
                { x: 0, y: 0 },
                20, // Default size
                colorID as any // Cast to any or ColorNumber if imported
            );
            this.tiles.push(newTile);
        }
    }

    onPointerMove(x: number, y: number) {
        if (this.isDragging && this.draggedTile) {
            this.draggedTile.pos.x = x;
            this.draggedTile.pos.y = y;

            // Update color to match new position
            if (this.backgroundImage) {
                this.draggedTile.colorID = this.sampleColor(x, y) as any;
            }
        }
    }

    onPointerUp() {
        this.isDragging = false;
        this.draggedTile = null;
    }

    // Cache for sampling to avoid recreating canvas/context every frame
    private samplingCanvas: HTMLCanvasElement | null = null;
    private samplingCtx: CanvasRenderingContext2D | null = null;

    private sampleColor(x: number, y: number): number {
        if (!this.backgroundImage) return 0;

        // Calculate render dimensions to match CSS 'background-size: contain' and 'background-position: center'
        const imgRatio = this.backgroundImage.width / this.backgroundImage.height;
        const screenRatio = viewport.width / viewport.height;

        let renderW, renderH, renderX, renderY;

        // "Contain" logic:
        // If screen is wider (larger ratio) than image, image is height-constrained.
        if (screenRatio > imgRatio) {
            renderH = viewport.height;
            renderW = viewport.height * imgRatio;
            renderY = 0;
            renderX = (viewport.width - renderW) / 2;
        } else {
            // Screen is narrower, image is width-constrained.
            renderW = viewport.width;
            renderH = viewport.width / imgRatio;
            renderX = 0;
            renderY = (viewport.height - renderH) / 2;
        }

        // Map screen coordinates to image coordinates
        const ix = Math.floor((x - renderX) * (this.backgroundImage.width / renderW));
        const iy = Math.floor((y - renderY) * (this.backgroundImage.height / renderH));

        // Check bounds
        if (ix < 0 || iy < 0 || ix >= this.backgroundImage.width || iy >= this.backgroundImage.height) {
            return 0; // default color if outside image bounds
        }

        // Lazy init sampling canvas
        if (!this.samplingCanvas || !this.samplingCtx) {
            this.samplingCanvas = document.createElement("canvas");
            this.samplingCanvas.width = 1;
            this.samplingCanvas.height = 1;
            this.samplingCtx = this.samplingCanvas.getContext("2d", { willReadFrequently: true });
        }

        const ctx = this.samplingCtx!;
        // Clear previous state just in case (though we overwrite)
        ctx.clearRect(0, 0, 1, 1);

        // Draw just the 1 pixel we need
        ctx.drawImage(this.backgroundImage, ix, iy, 1, 1, 0, 0, 1, 1);

        const p = ctx.getImageData(0, 0, 1, 1).data;

        // Check current palette for a match, or add if unique and space available
        // Threshold of 2500 corresponds to a Euclidean distance of 50 in RGB space
        return palette.findOrAddColor(p[0], p[1], p[2], 2500);
    }
}
