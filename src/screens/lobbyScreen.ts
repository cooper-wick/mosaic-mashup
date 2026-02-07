
import { Screen } from "../model/types/screen";
import { ScreenManager } from "./screenManager";
import { GameplayScreen } from "./gameplayScreen";
import { VoronoiContext } from "../shaders/rendering";

export class LobbyScreen implements Screen {
    constructor(
        private manager: ScreenManager,
        private glCtx: VoronoiContext,
        private overlay: CanvasRenderingContext2D
    ) { }

    enter() {
        // Show lobby UI (you could toggle DOM visibility or draw on overlay)
        const el = document.getElementById("lobby");
        if (el) el.style.display = "flex";

        const btnPlay = document.getElementById("btn-play");
        const btnDraw = document.getElementById("btn-draw");

        if (btnPlay) {
            btnPlay.onclick = () => this.startGame(0);
        }

        if (btnDraw) {
            // Lazy load DrawScreen to avoid circular dependencies if any
            import("./drawScreen").then(({ DrawScreen }) => {
                if (btnDraw) {
                    btnDraw.onclick = () => {
                        this.manager.switch(new DrawScreen(this.manager, this.glCtx, this.overlay));
                    };
                }
            });
        }
    }

    exit() {
        const el = document.getElementById("lobby");
        if (el) el.style.display = "none";

        // Cleanup listeners
        const btnPlay = document.getElementById("btn-play");
        const btnDraw = document.getElementById("btn-draw");
        if (btnPlay) btnPlay.onclick = null;
        if (btnDraw) btnDraw.onclick = null;
    }

    update(_dt: number) { }
    render() {
        // Could render a background animation here if desired
    }

    /** Call this from a "Play" button or from onPointerDown */
    startGame(levelIndex: number) {
        this.manager.switch(
            new GameplayScreen(this.manager, this.glCtx, this.overlay, levelIndex)
        );
    }


}
