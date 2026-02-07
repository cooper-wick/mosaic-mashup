// utils/viewport.ts

export const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2) // Cap at 2x for performance
};

export function updateViewportSize() {
    let width = window.innerWidth;
    if (document.body.classList.contains("draw-mode-active")) {
        width -= 240;
    }
    viewport.width = width;
    viewport.height = window.innerHeight;
}
