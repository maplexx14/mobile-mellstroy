import Canvas from "@/utils/Canvas";
import resolution from "@/resolution";
import * as GameSceneConstants from "@/gameScene/constants";

const VIDEO_MAP: Partial<Record<number, string>> = {
    [GameSceneConstants.CharAnimation.IDLE]: "idle",
    [GameSceneConstants.CharAnimation.IDLE2]: "idle2",
    [GameSceneConstants.CharAnimation.IDLE3]: "idle3",
    [GameSceneConstants.CharAnimation.EXCITED]: "excited",
    [GameSceneConstants.CharAnimation.WIN]: "win",
    [GameSceneConstants.CharAnimation.FAIL]: "fail",
    [GameSceneConstants.CharAnimation.CHEW]: "chew",
};

const LOOPING = new Set<number>([
    GameSceneConstants.CharAnimation.IDLE,
    GameSceneConstants.CharAnimation.CHEW,
]);

// Only the looping clips that are on-screen most of the time are kept fully
// buffered (preload="auto"). The rest decode on demand (preload="metadata"),
// trading a slight first-play hitch for not holding seven webm decode pipelines
// resident at once. Seven eager decoders was a large constant memory cost the
// old sprite character never had, and on iOS WKWebView it pushed the page into
// the texture-purge "black screen" after a few levels.
const EAGER = new Set<number>([
    GameSceneConstants.CharAnimation.IDLE,
    GameSceneConstants.CharAnimation.CHEW,
]);

// Base character size at CANVAS_SCALE=1 (2560x1440).
// Adjust if the character appears too large or too small.
const BASE_W = 500;
const BASE_H = 600; // stretched vertically

// How far to shift the video down from target.y (in base pixels at CANVAS_SCALE=1).
const Y_OFFSET = 250;

// Per-animation size overrides [scaleW, scaleH] (multipliers on top of BASE_W/BASE_H).
const ANIM_SCALE: Partial<Record<number, [number, number]>> = {
    [GameSceneConstants.CharAnimation.FAIL]: [0.5, 0.5],
};

// Chroma-key thresholds for the baked green-screen background (~rgb(71,250,0)).
// "Greenness" = green - max(red, blue). Screen pixels are ~179; subject pixels
// (skin, blue cap, bottle) are negative, so the separation is wide and safe.
const KEY_FULL = 60; // greenness above this => fully transparent
const KEY_SOFT = 20; // greenness between SOFT..FULL => feathered edge + despill

class VideoCharacter {
    private videos = new Map<number, HTMLVideoElement>();
    private currentId = -1;
    private current: HTMLVideoElement | null = null;
    // Offscreen canvas holding the most recently chroma-keyed video frame.
    private keyCanvas: HTMLCanvasElement | null = null;
    private keyCtx: CanvasRenderingContext2D | null = null;
    // State of the cached keyed frame, so we only re-key when something changed.
    private keyedVideo: HTMLVideoElement | null = null;
    private keyedW = 0;
    private keyedH = 0;
    // Set when the video decodes a genuinely new frame (via rVFC). currentTime
    // can't be used to detect this — it advances continuously every render frame
    // even though the video only decodes ~30 frames/sec, which would force the
    // expensive getImageData readback every frame and throttle iOS to ~30fps.
    private frameDirty = true;
    private lastKeyWallMs = 0;
    // Bumped on every play(). Each requestVideoFrameCallback chain captures the
    // generation it was started with and stops re-registering once a newer play()
    // supersedes it. Without this, every play() (including re-triggering the clip
    // already showing) started a *second* perpetual rVFC chain that the
    // `current !== video` guard never killed — they accumulated for the lifetime
    // of this shared singleton, i.e. across every level.
    private frameCallbackGen = 0;

    // One shared instance per basePath, reused across levels. Recreating it each
    // level spawned 7 fresh <video> elements (and their decoders) every time;
    // on iOS the old ones were not freed promptly, so memory grew level after
    // level until the page thrashed and textures were purged (black screen).
    private static instances = new Map<string, VideoCharacter>();

    static shared(basePath: string): VideoCharacter {
        let instance = VideoCharacter.instances.get(basePath);
        if (!instance) {
            instance = new VideoCharacter(basePath);
            VideoCharacter.instances.set(basePath, instance);
        }
        return instance;
    }

    constructor(basePath: string) {
        for (const [id, name] of Object.entries(VIDEO_MAP)) {
            const animId = Number(id);
            const v = document.createElement("video");
            v.src = `${basePath}/${name}.webm`;
            v.preload = EAGER.has(animId) ? "auto" : "metadata";
            v.muted = true;
            v.playsInline = true;
            v.style.display = "none";
            document.body.appendChild(v);
            this.videos.set(animId, v);
        }
    }

    play(animId: number): void {
        const next = this.videos.get(animId);
        if (!next) return;
        if (this.current && this.currentId !== animId) {
            this.current.pause();
        }
        this.currentId = animId;
        this.current = next;
        next.currentTime = 0;
        next.loop = LOOPING.has(animId);
        next.play().catch(() => {});
        this.frameDirty = true;
        this.registerFrameCallback(next, ++this.frameCallbackGen);
    }

    // Mark a re-key as needed exactly once per decoded video frame. Without
    // requestVideoFrameCallback support we fall back to a wall-clock throttle in
    // draw(), so the readback still runs at most ~video-rate, never per frame.
    private registerFrameCallback(video: HTMLVideoElement, gen: number): void {
        const rvfc = (
            video as HTMLVideoElement & {
                requestVideoFrameCallback?: (cb: () => void) => number;
            }
        ).requestVideoFrameCallback;
        if (typeof rvfc !== "function") {
            return;
        }
        rvfc.call(video, () => {
            // Stop if a newer play() superseded this chain or the clip changed,
            // so only the single latest chain stays alive.
            if (gen !== this.frameCallbackGen || this.current !== video) {
                return;
            }
            this.frameDirty = true;
            this.registerFrameCallback(video, gen);
        });
    }

    draw(x: number, y: number): void {
        const ctx = Canvas.context;
        // readyState 2 = HAVE_CURRENT_DATA, need at least a frame to draw
        if (!ctx || !this.current || (this.current.readyState as number) < 2) return;
        const [sw, sh] = ANIM_SCALE[this.currentId] ?? [1, 1];
        const w = Math.round(BASE_W * sw * resolution.CANVAS_SCALE);
        const h = Math.round(BASE_H * sh * resolution.CANVAS_SCALE);
        const yOff = Math.round(Y_OFFSET * resolution.CANVAS_SCALE);
        if (w <= 0 || h <= 0) return;

        const dx = (x - w / 2) | 0;
        const dy = (y - h + yOff) | 0;

        // The source videos have a baked-in green-screen background (no alpha),
        // so a plain drawImage paints the green. Chroma-key on an offscreen
        // canvas to remove it. The keyed result is cached and only recomputed
        // when the video advances to a new frame (or the clip/size changes) —
        // the video runs at ~30fps while render runs at 60-120fps, so this
        // avoids re-reading/processing identical pixels several times per frame.
        let kc = this.keyCanvas;
        if (!kc) {
            kc = document.createElement("canvas");
            this.keyCanvas = kc;
            this.keyCtx = kc.getContext("2d", { willReadFrequently: true });
        }
        const kctx = this.keyCtx;
        if (!kctx) {
            // Canvas 2D unavailable: fall back to the (green) direct draw.
            ctx.drawImage(this.current, dx, dy, w, h);
            return;
        }

        // Re-key only when the clip/size changed or a new video frame decoded.
        // rVFC sets frameDirty per decoded frame; if it's unavailable, throttle
        // the readback to ~33ms (≈ the source video's frame rate) so it never
        // runs on every render frame — that per-frame GPU readback is what caps
        // iOS at ~30fps.
        const supportsRvfc =
            typeof (this.current as HTMLVideoElement & { requestVideoFrameCallback?: unknown })
                .requestVideoFrameCallback === "function";
        const nowMs = performance.now();
        const newFrame = supportsRvfc ? this.frameDirty : nowMs - this.lastKeyWallMs >= 33;
        const needsRekey =
            this.keyedVideo !== this.current ||
            this.keyedW !== w ||
            this.keyedH !== h ||
            newFrame;

        if (needsRekey) {
            if (kc.width !== w || kc.height !== h) {
                kc.width = w;
                kc.height = h;
            }

            kctx.clearRect(0, 0, w, h);
            kctx.drawImage(this.current, 0, 0, w, h);

            let frame: ImageData;
            try {
                frame = kctx.getImageData(0, 0, w, h);
            } catch {
                // getImageData can throw if the canvas is tainted; draw raw frame.
                ctx.drawImage(this.current, dx, dy, w, h);
                return;
            }

            const d = frame.data;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i] ?? 0;
                const g = d[i + 1] ?? 0;
                const b = d[i + 2] ?? 0;
                const maxRB = r > b ? r : b;
                const greenness = g - maxRB;
                if (greenness > KEY_FULL) {
                    d[i + 3] = 0;
                } else if (greenness > KEY_SOFT) {
                    // Feather the edge and pull green spill toward the subject.
                    d[i + 3] = (((KEY_FULL - greenness) * 255) / (KEY_FULL - KEY_SOFT)) | 0;
                    if (g > maxRB) {
                        d[i + 1] = maxRB;
                    }
                }
            }
            kctx.putImageData(frame, 0, 0);

            this.keyedVideo = this.current;
            this.keyedW = w;
            this.keyedH = h;
            this.frameDirty = false;
            this.lastKeyWallMs = nowMs;
        }

        // Blit the cached keyed frame (cheap; runs every render frame).
        ctx.drawImage(kc, dx, dy);
    }

    destroy(): void {
        for (const v of this.videos.values()) {
            v.pause();
            v.remove();
        }
        this.videos.clear();
        this.keyCanvas = null;
        this.keyCtx = null;
        this.keyedVideo = null;
        this.frameDirty = true;
    }
}

export default VideoCharacter;
