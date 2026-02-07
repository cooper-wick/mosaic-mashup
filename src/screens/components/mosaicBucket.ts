import { ColorNumber } from "../../model/types/color";
import { PALETTE } from "../../utils/constants";

export class MosaicBucket {
    public readonly element: HTMLElement;
    private countEl: HTMLElement;
    private dotEl: HTMLElement;
    private checkmarkEl: HTMLElement;

    private _count: number = 0;
    private _target: number = 0;

    constructor(parent: HTMLElement, public readonly colorID: ColorNumber, target: number) {
        this._target = target;

        this.element = document.createElement("div");
        this.element.className = "mosaic-bucket";
        this.element.dataset.colorId = colorID.toString();

        this.dotEl = document.createElement("div");
        this.dotEl.className = "bucket-dot";
        const cssColor = PALETTE[colorID].css;
        this.dotEl.style.backgroundColor = cssColor;
        this.dotEl.style.boxShadow = `0 0 10px ${cssColor}`;

        const textColor = this.getContrastYIQ(cssColor);

        this.countEl = document.createElement("span");
        this.countEl.className = "bucket-count";
        this.countEl.style.color = textColor;

        this.checkmarkEl = document.createElement("span");
        this.checkmarkEl.className = "bucket-check";
        this.checkmarkEl.textContent = "✓";
        this.checkmarkEl.style.display = "none";

        this.checkmarkEl.style.color = textColor;
        if (textColor === '#000000') {
            this.checkmarkEl.style.filter = 'none'; // Remove green shadow if black
        }

        // Initial state
        this.update(0);

        this.element.appendChild(this.dotEl);
        this.element.appendChild(this.countEl);
        this.element.appendChild(this.checkmarkEl);

        parent.appendChild(this.element);
    }

    update(current: number) {
        this._count = current;

        if (this._count >= this._target) {
            this.element.classList.add("filled");
            this.countEl.style.display = "none";
            this.checkmarkEl.style.display = "block";
        } else {
            this.element.classList.remove("filled");
            this.countEl.style.display = "block";
            this.checkmarkEl.style.display = "none";
            this.countEl.textContent = `${this._count}/${this._target}`;
        }
    }


    setRevealMode(countToFly: number) {
        this.element.classList.add("reveal-mode");
        this.element.classList.remove("filled"); // Remove filled style to show number again?
        this.checkmarkEl.style.display = "none";
        this.countEl.style.display = "block";
        this.countEl.textContent = countToFly.toString();
        this.setInteractive(true);
    }

    setInteractive(interactive: boolean) {
        if (interactive) {
            this.element.style.pointerEvents = "auto";
            this.element.style.cursor = "pointer";
            this.element.classList.add("interactive");
        } else {
            this.element.style.pointerEvents = "none";
            this.element.style.cursor = "default";
            this.element.classList.remove("interactive");
        }
    }

    getBounds(): DOMRect {
        return this.element.getBoundingClientRect();
    }

    getCenter(): { x: number, y: number } {
        const rect = this.getBounds();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    private getContrastYIQ(hex: string): string {
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#000000' : '#ffffff';
    }
}
