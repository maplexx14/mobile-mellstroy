import resolution from "@/resolution";

type StyleOverrides = Partial<Record<string, string>>;

interface TelegramViewport {
    viewportHeight?: number;
    viewportStableHeight?: number;
}

// Portrait fills the viewport width but never crops more than this fraction of
// the canvas height from the bottom, so bottom UI stays on screen on windows
// wider than the 9:19.5 design ratio.
const MAX_PORTRAIT_CROP = 0.12;

class ZoomManager {
    #bgZoom = 1;
    #element: HTMLElement | null = null;
    #nativeHeight = 0;
    #nativeWidth = 0;
    #transformOrigin = "top left";
    #zoom = 1;
    readonly originalHeight = 270;

    domReady(): void {
        this.setElementId("gameContainer");
        this.#nativeWidth = resolution.UI_WIDTH;
        this.#nativeHeight = resolution.UI_HEIGHT;
        this.autoResize();
    }

    setElementId(elementId: string): void {
        this.#element = document.getElementById(elementId);
    }

    setElement(element: HTMLElement | null): void {
        this.#element = element;
    }

    updateCss(css: StyleOverrides = {}): void {
        if (!this.#element) {
            return;
        }

        const scaleValue = this.#zoom === 1 ? "" : `scale(${this.#zoom})`;
        const originValue = this.#zoom === 1 ? "" : this.#transformOrigin;

        this.#element.style.transform = scaleValue;
        this.#element.style.transformOrigin = originValue;

        Object.assign(this.#element.style, css);
    }

    getCanvasZoom(): number {
        return this.#zoom || 1;
    }

    getUIZoom(): number {
        return this.#zoom || 1;
    }

    autoResize(): void {
        window.addEventListener("resize", () => this.resize());
        window.visualViewport?.addEventListener("resize", () => this.resize());

        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.onEvent("viewportChanged", () => this.resize());
        }

        this.resize();
    }

    #getViewportSize(): { width: number; height: number } {
        const viewport = window.visualViewport;
        const width = viewport?.width ?? window.innerWidth;
        let height = viewport?.height ?? window.innerHeight;

        // In a Telegram Mini App the usable area is below the native header.
        // viewportStableHeight reflects that area; visualViewport.height can
        // report more (counting space under the header), which would make the
        // "contain" fit overflow. Prefer the smaller, header-aware value.
        const tg = (window as unknown as { Telegram?: { WebApp?: TelegramViewport } }).Telegram
            ?.WebApp;
        if (tg) {
            const tgHeight =
                tg.viewportStableHeight && tg.viewportStableHeight > 0
                    ? tg.viewportStableHeight
                    : tg.viewportHeight && tg.viewportHeight > 0
                      ? tg.viewportHeight
                      : 0;
            if (tgHeight > 0) {
                height = Math.min(height, tgHeight);
            }
        }

        return { width, height };
    }

    resize(skipZoom = false): void {
        const element = this.#element;
        if (!element) {
            return;
        }

        const { width: vpWidth, height: vpHeight } = this.#getViewportSize();

        const nativeWidth = this.#nativeWidth;
        const nativeHeight = this.#nativeHeight;
        const originalHeight = this.originalHeight;

        if (!skipZoom) {
            if (this.#nativeHeight > this.#nativeWidth) {
                // Portrait canvas: fill the viewport width and sacrifice overflow
                // from the BOTTOM (anchored top below). But cap how much can be
                // cropped so the bottom UI (menu Play button, HUD) never gets cut
                // off on wider windows (e.g. Telegram Desktop). When filling width
                // would crop more than MAX_PORTRAIT_CROP of the canvas height, the
                // zoom is reduced instead, adding thin transparent side margins.
                const fillWidth = vpWidth / nativeWidth;
                const maxForCrop = vpHeight / (nativeHeight * (1 - MAX_PORTRAIT_CROP));
                this.#zoom = Math.min(fillWidth, maxForCrop);
            } else {
                // Landscape canvas: cover mode fills the viewport.
                this.#zoom = Math.max(vpWidth / nativeWidth, vpHeight / nativeHeight);
            }
        }

        this.#bgZoom = vpHeight / (originalHeight * this.#zoom);

        this.#applyBackgroundScale(".coverBg", `scale(${this.#bgZoom})`);
        this.#applyBackgroundScale(".scaleBg", `scaleY(${this.#bgZoom})`);

        const scaledWidth = nativeWidth * this.#zoom;
        const scaledHeight = nativeHeight * this.#zoom;
        const left = Math.round((vpWidth - scaledWidth) / 2);
        // Portrait anchors to the top so any vertical overflow is cropped from
        // the bottom only; landscape centres (symmetric crop).
        const top =
            nativeHeight > nativeWidth ? 0 : Math.round((vpHeight - scaledHeight) / 2);

        this.updateCss({
            position: "absolute",
            left: `${left}px`,
            top: `${top}px`,
            width: `${nativeWidth}px`,
            height: `${nativeHeight}px`,
        });
    }

    #applyBackgroundScale(selector: string, transformValue: string): void {
        document.querySelectorAll(selector).forEach((el) => {
            if (el instanceof HTMLElement) {
                el.style.transform = transformValue;
            }
        });
    }
}

export default new ZoomManager();
