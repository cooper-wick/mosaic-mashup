// utils/viewport.ts

export const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2) // Cap at 2x for performance
};

export function updateViewportSize() {
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;
}
