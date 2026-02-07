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
window.addEventListener("mousedown", e => screens.onPointerDown(e.clientX, e.clientY, e));
window.addEventListener("mousemove", e => screens.onPointerMove(e.clientX, e.clientY));
window.addEventListener("mouseup", () => screens.onPointerUp());

window.addEventListener("touchstart", e => {
    screens.onPointerDown(e.touches[0].clientX, e.touches[0].clientY, e);
});
window.addEventListener("touchmove", e => {
    e.preventDefault();
    screens.onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
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
