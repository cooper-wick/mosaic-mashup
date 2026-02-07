import { Screen } from "../model/types/screen";

export class ScreenManager {
    private current: Screen | null = null;

    switch(next: Screen) {
        this.current?.exit();
        this.current = next;
        this.current.enter();
    }

    get active(): Screen | null {
        return this.current;
    }

    update(dt: number) { this.current?.update(dt); }
    render() { this.current?.render(); }

    onPointerDown(x: number, y: number, event?: MouseEvent | TouchEvent) { this.current?.onPointerDown?.(x, y, event); }
    onPointerMove(x: number, y: number) { this.current?.onPointerMove?.(x, y); }
    onPointerUp() { this.current?.onPointerUp?.(); }
    onResize() { this.current?.onResize?.(); }
}
