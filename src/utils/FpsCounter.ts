/**
 * Lightweight on-screen FPS counter.
 *
 * Runs its own requestAnimationFrame loop (same cadence the game renders at, so
 * the number reflects real render FPS) and shows the result in a fixed DOM
 * overlay pinned to the top-centre of the screen. Independent of the game's
 * controller state, so it is visible on every screen (menu and gameplay alike).
 */
class FpsCounter {
    private el: HTMLDivElement | null = null;
    private frames = 0;
    private accumMs = 0;
    private lastTime = 0;
    private running = false;

    start(): void {
        if (this.running || typeof document === "undefined") {
            return;
        }
        this.running = true;

        const el = document.createElement("div");
        el.id = "fpsCounter";
        Object.assign(el.style, {
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 2px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "2147483647",
            font: "bold 14px system-ui, -apple-system, sans-serif",
            color: "#2eff2e",
            background: "rgba(0, 0, 0, 0.55)",
            padding: "2px 8px",
            borderRadius: "0 0 8px 8px",
            pointerEvents: "none",
            fontVariantNumeric: "tabular-nums",
            lineHeight: "1.2",
        });
        el.textContent = "-- fps";
        document.body.appendChild(el);
        this.el = el;

        this.lastTime = performance.now();
        requestAnimationFrame(this.tick);
    }

    private tick = (now: number): void => {
        this.frames++;
        this.accumMs += now - this.lastTime;
        this.lastTime = now;

        // Refresh the readout a couple of times per second.
        if (this.accumMs >= 500) {
            const fps = Math.round((this.frames * 1000) / this.accumMs);
            if (this.el) {
                this.el.textContent = `${fps} fps`;
            }
            this.frames = 0;
            this.accumMs = 0;
        }

        requestAnimationFrame(this.tick);
    };
}

export default new FpsCounter();
