import settings from "@/game/CTRSettings";
import scaleResolution from "@/config/resolutions/scale";
import resPortrait from "@/config/resolutions/portrait";
import res480 from "@/config/resolutions/480x270";
import res768 from "@/config/resolutions/768x432";
import res1024 from "@/config/resolutions/1024x576";
import res1920 from "@/config/resolutions/1920x1080";
import res2560 from "@/config/resolutions/2560x1440";

import type { ResolutionProfile } from "@/types/resolution";

interface ResolutionCandidate {
    profile: Partial<ResolutionProfile>;
    isHd: boolean;
    minWidth: number;
    minHeight: number;
}

const resolutionCandidates: ResolutionCandidate[] = [
    //{ profile: res2560, isHd: true, minWidth: 2400, minHeight: 1350 },
    { profile: res1920, isHd: true, minWidth: 1600, minHeight: 900 },
    //{ profile: res1024, isHd: true, minWidth: 1024, minHeight: 576 },
    //{ profile: res768, isHd: false, minWidth: 768, minHeight: 432 },
    //{ profile: res480, isHd: false, minWidth: 0, minHeight: 0 },
];

const getViewportSize = (): { width: number; height: number } => {
    if (typeof window === "undefined") {
        return { width: 1920, height: 1080 };
    }

    // In Telegram WebApp, use its viewport dimensions which reflect the
    // actual mini-app size (after expand()) more reliably than window.innerHeight.
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
        const tgW = window.innerWidth;
        const tgH = tg.viewportStableHeight > 0 ? tg.viewportStableHeight : tg.viewportHeight > 0 ? tg.viewportHeight : window.innerHeight;
        return { width: tgW, height: tgH };
    }

    return { width: window.innerWidth, height: window.innerHeight };
};

const selectResolution = (): ResolutionCandidate => {
    const { width, height } = getViewportSize();

    // Telegram Mini App panels are portrait on every client — phone, Desktop
    // and Web alike — so always use the portrait profile inside Telegram,
    // regardless of the viewport size reported at init (expand() may not have
    // taken effect yet, and Desktop can momentarily report a wide viewport).
    // Outside Telegram, fall back to viewport orientation.
    const insideTelegram = !!(window as any).Telegram?.WebApp;

    if (insideTelegram || height > width) {
        return { profile: resPortrait, isHd: true, minWidth: 0, minHeight: 0 };
    }

    for (const candidate of resolutionCandidates) {
        if (width >= candidate.minWidth && height >= candidate.minHeight) {
            return candidate;
        }
    }

    return resolutionCandidates[resolutionCandidates.length - 1]!;
};

const candidate = selectResolution();
const resolution = scaleResolution(candidate.profile);

settings.setIsHD(candidate.isHd);

export default resolution;
