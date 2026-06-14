import type { ResolutionProfile } from "@/types/resolution";

/**
 * Portrait profile for mobile phones.
 *
 * Cut the Rope levels are authored in a portrait shape (320x480 units). The
 * landscape 1920x1080 profile renders that level as a 720x1080 column centred
 * in a wide canvas with empty decorative margins on the sides. This profile
 * crops those side margins so the level fills a vertical phone screen.
 *
 * Sprite/physics scale is intentionally identical to the 1920 profile
 * (PM 2.25, CANVAS_SCALE 0.75) so gameplay and sprite crispness are unchanged —
 * only the visible canvas window becomes portrait. Assets are reused from
 * public/images/1920 via UI_ASSET_WIDTH.
 */
const resPortrait: Partial<ResolutionProfile> = {
    VIDEO_WIDTH: 1280,

    // Level column is 320 * PM = 720 wide; the canvas matches so PMX = 0 (no
    // side margins). Height is taller than the level (480 * 2.25 = 1080) so the
    // level is centred vertically via PMY with cardboard background above/below.
    CANVAS_WIDTH: 720,
    CANVAS_HEIGHT: 1560,
    CANVAS_SCALE: 0.75,

    // Reuse the 1920 asset set; UI coordinate space is 720 wide.
    UI_ASSET_WIDTH: 1920,
    cssClass: "ui-portrait",

    UI_IMAGES_SCALE: 0.703125, // 720 / 1024, matching the other profiles' pattern
    UI_TEXT_SCALE: 1,
    UI_WIDTH: 720,
    UI_HEIGHT: 1560,

    BUNGEE_BEZIER_POINTS: 3,
    DEFAULT_BUNGEE_LINE_WIDTH: 6,
    DEFAULT_BUNGEE_WIDTH: 5,

    // Same level<->canvas mapping as 1920 so sprites/physics are unchanged.
    PM: 2.25,
    PMY: 0,

    GRAB_RADIUS_ALPHA: 0.8,

    BUBBLE_IMPULSE_Y: -23,
    BUBBLE_IMPULSE_RD: 23,

    BOUNCER_MAX_MOVEMENT: 510,

    PUMP_POWER_RADIUS: 475,

    PHYSICS_SPEED_MULTIPLIER: 1.05,
} as const;

window.resolution = resPortrait as ResolutionProfile;

export default resPortrait;
