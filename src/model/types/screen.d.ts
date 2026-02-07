/**
 * Lifecycle interface for each screen.
 * Implement only what you need — all methods have defaults via BaseScreen.
 */
export interface Screen {
    enter(): void;
    exit(): void;
    update(dt: number): void;
    render(): void;
    onPointerDown?(x: number, y: number): void;
    onPointerMove?(x: number, y: number): void;
    onPointerUp?(): void;
    onResize?(): void;
}
