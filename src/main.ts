import './style.css';
import { initGL, resizeGL } from "./shaders/rendering";
import { updateViewportSize, viewport } from "./utils/viewport";
import { ScreenManager } from "./screens/screenManager";
import { LobbyScreen } from "./screens/lobbyScreen";

// ── Canvas setup ───────────────────────────────────────────
const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
const olCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const olCtx = olCanvas.getContext("2d")!;
const glCtx = initGL(glCanvas);

olCanvas.width = viewport.width;
olCanvas.height = viewport.height;

// ── Screen manager ─────────────────────────────────────────
const screens = new ScreenManager();
screens.switch(new LobbyScreen(screens, glCtx, olCtx));

// ── Main loop ──────────────────────────────────────────────
let last = performance.now();

function frame(now: number) {
    const dt = (now - last) / 1000; // seconds
    last = now;

    screens.update(dt);
    screens.render();

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── Input routing ──────────────────────────────────────────
// ── Input routing ──────────────────────────────────────────
function getRelativeCoords(clientX: number, clientY: number) {
    const rect = glCanvas.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

window.addEventListener("mousedown", e => {
    const { x, y } = getRelativeCoords(e.clientX, e.clientY);
    screens.onPointerDown(x, y, e);
});
window.addEventListener("mousemove", e => {
    const { x, y } = getRelativeCoords(e.clientX, e.clientY);
    screens.onPointerMove(x, y);
});
window.addEventListener("mouseup", () => screens.onPointerUp());

window.addEventListener("touchstart", e => {
    const { x, y } = getRelativeCoords(e.touches[0].clientX, e.touches[0].clientY);
    screens.onPointerDown(x, y, e);
});
window.addEventListener("touchmove", e => {
    e.preventDefault();
    const { x, y } = getRelativeCoords(e.touches[0].clientX, e.touches[0].clientY);
    screens.onPointerMove(x, y);
}, { passive: false });
window.addEventListener("touchend", () => screens.onPointerUp());

// ── Resize ─────────────────────────────────────────────────
window.addEventListener("resize", () => {
    updateViewportSize();
    olCanvas.width = viewport.width;
    olCanvas.height = viewport.height;
    resizeGL(glCtx);
    screens.onResize();
});
