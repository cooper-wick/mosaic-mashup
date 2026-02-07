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

    private mosaicWidth: number = viewport.width;
    private mosaicHeight: number = viewport.height;
    private frameRect: { x: number, y: number, w: number, h: number } = { x: 0, y: 0, w: 0, h: 0 };

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
        const txtWidth = document.getElementById("mosaic-width") as HTMLInputElement;
        const txtHeight = document.getElementById("mosaic-height") as HTMLInputElement;

        // Init inputs
        if (txtWidth && txtHeight) {
            txtWidth.value = this.mosaicWidth.toString();
            txtHeight.value = this.mosaicHeight.toString();

            txtWidth.onchange = () => {
                const val = parseInt(txtWidth.value);
                if (!isNaN(val) && val > 0) {
                    this.mosaicWidth = val;
                    this.updateMosaicFrame();
                }
            };
            txtHeight.onchange = () => {
                const val = parseInt(txtHeight.value);
                if (!isNaN(val) && val > 0) {
                    this.mosaicHeight = val;
                    this.updateMosaicFrame();
                }
            };
        }

        if (btnUpload && fileInput) {
            btnUpload.onclick = () => fileInput.click();
            fileInput.onchange = (e) => this.handleImageUpload(e);
        }

        // Initial update
        this.updateMosaicFrame();

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

                // Shift tiles to be relative to (0,0) of the mosaic
                const exportedTiles = this.tiles.map(t => {
                    const nt = t.clone();
                    nt.pos.x -= this.frameRect.x;
                    nt.pos.y -= this.frameRect.y;
                    return nt;
                });

                const mosaic = new CompletedMosaic(name, this.mosaicWidth, this.mosaicHeight, exportedTiles);
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

                    this.mosaicWidth = mosaic.width;
                    this.mosaicHeight = mosaic.height;

                    if (txtWidth) txtWidth.value = this.mosaicWidth.toString();
                    if (txtHeight) txtHeight.value = this.mosaicHeight.toString();

                    this.updateMosaicFrame();

                    // Shift tiles to be absolute screen coordinates
                    this.tiles = mosaic.tiles.map(t => {
                        const nt = t.clone();
                        nt.pos.x += this.frameRect.x;
                        nt.pos.y += this.frameRect.y;
                        return nt;
                    });

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

        // Draw Frame Border
        const ctx = this.overlay;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(this.frameRect.x, this.frameRect.y, this.frameRect.w, this.frameRect.h);

        render(this.glCtx, this.tiles, true);

        // Draw dots at seed points
        ctx.fillStyle = "black";
        for (const tile of this.tiles) {
            ctx.beginPath();
            ctx.arc(tile.pos.x, tile.pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    onResize() {
        resizeGL(this.glCtx);
        this.updateMosaicFrame();
    }

    private updateMosaicFrame() {
        // Center the mosaic frame in the viewport
        const x = (viewport.width - this.mosaicWidth) / 2;
        const y = (viewport.height - this.mosaicHeight) / 2;
        this.frameRect = { x, y, w: this.mosaicWidth, h: this.mosaicHeight };

        // Update background layer to match
        const bgLayer = document.getElementById("background-layer");
        if (bgLayer) {
            bgLayer.style.left = `${x}px`;
            bgLayer.style.top = `${y}px`;
            bgLayer.style.width = `${this.mosaicWidth}px`;
            bgLayer.style.height = `${this.mosaicHeight}px`;
            // Ensure cover is used so it fills the mosaic frame exactly as we sample
            bgLayer.style.backgroundSize = "cover";
            bgLayer.style.backgroundPosition = "center";
        }
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
                        // Positioning handled by updateMosaicFrame + CSS
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

        // Ensure x,y is inside the frame
        if (x < this.frameRect.x || x >= this.frameRect.x + this.frameRect.w ||
            y < this.frameRect.y || y >= this.frameRect.y + this.frameRect.h) {
            return 0; // Outside mosaic area
        }

        // Relative coordinates inside the mosaic frame
        const relX = x - this.frameRect.x;
        const relY = y - this.frameRect.y;

        const frameW = this.frameRect.w;
        const frameH = this.frameRect.h;

        // Image dimensions
        const imgW = this.backgroundImage.width;
        const imgH = this.backgroundImage.height;

        // "Cover" logic simulation:
        // Key idea: Scale image so it covers the frame.
        // If image aspect > frame aspect (image is wider), scale by height, crop sides.
        // If image aspect < frame aspect (image is taller), scale by width, crop top/bottom.

        const imgRatio = imgW / imgH;
        const frameRatio = frameW / frameH;

        let renderW, renderH, renderX, renderY;

        if (imgRatio > frameRatio) {
            // Image is wider than frame: Height match, crop width.
            renderH = frameH;
            renderW = frameH * imgRatio;
            renderY = 0;
            renderX = (frameW - renderW) / 2; // Negative offset
        } else {
            // Image is taller than frame: Width match, crop height.
            renderW = frameW;
            renderH = frameW / imgRatio;
            renderX = 0;
            renderY = (frameH - renderH) / 2; // Negative offset
        }

        // Map relative screen coordinates (relX, relY) to image coordinates
        // renderX/Y is where the top-left of the image would be relative to the frame top-left.
        // So: local_image_pos_x = relX - renderX
        // Then scale back to natural image size.

        const ix = Math.floor((relX - renderX) * (imgW / renderW));
        const iy = Math.floor((relY - renderY) * (imgH / renderH));

        // Start sampling
        if (!this.samplingCanvas || !this.samplingCtx) {
            this.samplingCanvas = document.createElement("canvas");
            this.samplingCanvas.width = 1;
            this.samplingCanvas.height = 1;
            this.samplingCtx = this.samplingCanvas.getContext("2d", { willReadFrequently: true });
        }

        // Check bounds (though logic should keep it generally safe, rounding might be off)
        if (ix < 0 || iy < 0 || ix >= imgW || iy >= imgH) return 0;

        const ctx = this.samplingCtx!;
        ctx.clearRect(0, 0, 1, 1);
        ctx.drawImage(this.backgroundImage, ix, iy, 1, 1, 0, 0, 1, 1);
        const p = ctx.getImageData(0, 0, 1, 1).data;

        return palette.findOrAddColor(p[0], p[1], p[2], 2500);
    }
}
