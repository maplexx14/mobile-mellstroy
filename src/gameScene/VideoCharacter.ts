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

class VideoCharacter {
    private videos = new Map<number, HTMLVideoElement>();
    private currentId = -1;
    private current: HTMLVideoElement | null = null;

    constructor(basePath: string) {
        for (const [id, name] of Object.entries(VIDEO_MAP)) {
            const v = document.createElement("video");
            v.src = `${basePath}/${name}.webm`;
            v.preload = "auto";
            v.muted = true;
            v.playsInline = true;
            v.style.display = "none";
            document.body.appendChild(v);
            this.videos.set(Number(id), v);
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
    }

    draw(x: number, y: number): void {
        const ctx = Canvas.context;
        // readyState 2 = HAVE_CURRENT_DATA, need at least a frame to draw
        if (!ctx || !this.current || (this.current.readyState as number) < 2) return;
        const [sw, sh] = ANIM_SCALE[this.currentId] ?? [1, 1];
        const w = Math.round(BASE_W * sw * resolution.CANVAS_SCALE);
        const h = Math.round(BASE_H * sh * resolution.CANVAS_SCALE);
        const yOff = Math.round(Y_OFFSET * resolution.CANVAS_SCALE);
        ctx.drawImage(this.current, (x - w / 2) | 0, (y - h + yOff) | 0, w, h);
    }

    destroy(): void {
        for (const v of this.videos.values()) {
            v.pause();
            v.remove();
        }
        this.videos.clear();
    }
}

export default VideoCharacter;
