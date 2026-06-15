/**
 * Shared image + atlas fetching helpers used by both PreLoader (initial load)
 * and DeferredLoader (lazy per-box load). Extracted from PreLoader.ts so both
 * loaders walk the same fetch paths.
 */

type UrlFacade = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

export interface ImageAsset {
    drawable: ImageBitmap | HTMLImageElement;
    width: number;
    height: number;
    sourceUrl: string;
}

// iOS WKWebView (incl. Telegram iOS) discards ImageBitmap backing stores under
// memory pressure — after a few levels every drawImage(bitmap) renders blank and
// never recovers, because an ImageBitmap has no source to re-decode from. An
// HTMLImageElement keeps its encoded source, so WebKit transparently re-decodes
// it when drawn again. Decode to <img> on iOS to keep textures durable.
const isIOS =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const supportsImageBitmap = typeof createImageBitmap === "function" && !isIOS;

const getUrlFacade = (): UrlFacade | null => {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        return URL;
    }
    if (typeof window !== "undefined") {
        const legacyWindow = window as typeof window & { webkitURL?: UrlFacade };
        const legacy = legacyWindow.webkitURL;
        if (legacy && typeof legacy.createObjectURL === "function") {
            return legacy;
        }
    }
    return null;
};

const loadImageElement = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";

        const cleanup = () => {
            img.removeEventListener("load", onLoad);
            img.removeEventListener("error", onError);
        };

        const onLoad = () => {
            cleanup();
            resolve(img);
        };

        const onError = () => {
            cleanup();
            reject(new Error(`Failed to load image: ${url}`));
        };

        img.addEventListener("load", onLoad);
        img.addEventListener("error", onError);
        img.src = url;
    });

const loadBitmapFromElement = async (url: string): Promise<ImageBitmap> => {
    const img = await loadImageElement(url);
    if (typeof img.decode === "function") {
        try {
            await img.decode();
        } catch (error) {
            window.console?.warn?.("Image decode failed, continuing with bitmap creation", error);
        }
    }
    return createImageBitmap(img);
};

const createImageAsset = (
    drawable: ImageBitmap | HTMLImageElement,
    sourceUrl: string
): ImageAsset => {
    const naturalWidth =
        ("naturalWidth" in drawable ? drawable.naturalWidth : drawable.width) ?? 0;
    const naturalHeight =
        ("naturalHeight" in drawable ? drawable.naturalHeight : drawable.height) ?? 0;

    return { drawable, width: naturalWidth, height: naturalHeight, sourceUrl };
};

const fetchImageBlob = async (url: RequestInfo | URL): Promise<Blob> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }
    return response.blob();
};

const loadImageFromBlob = async (blob: Blob, fallbackUrl: string): Promise<HTMLImageElement> => {
    const urlFacade = getUrlFacade();
    if (!urlFacade) {
        if (fallbackUrl) {
            return loadImageElement(fallbackUrl);
        }
        throw new Error("Object URL API not available");
    }
    const objectUrl = urlFacade.createObjectURL(blob);
    try {
        return await loadImageElement(objectUrl);
    } finally {
        urlFacade.revokeObjectURL(objectUrl);
    }
};

/**
 * Fetches an image and returns it wrapped in an {@link ImageAsset} with natural
 * dimensions. Prefers ImageBitmap when available, falls back to blob → bitmap,
 * then to HTMLImageElement as a last resort.
 */
export const loadImageAsset = async (url: string): Promise<ImageAsset> => {
    if (!url) {
        throw new Error("Image URL must be provided");
    }

    // iOS: load straight into an <img>. It keeps its source so WebKit can
    // re-decode after discarding the backing store under memory pressure,
    // preventing textures from going blank after several levels.
    if (isIOS) {
        const img = await loadImageElement(url);
        // Kick off a best-effort pre-decode but DO NOT await it: on iOS
        // img.decode() can hang and never settle under memory pressure, which
        // would stall the whole level load and leave a permanent black screen.
        // drawImage decodes lazily anyway if this hasn't finished.
        if (typeof img.decode === "function") {
            void img.decode().catch(() => {});
        }
        return createImageAsset(img, url);
    }

    if (!supportsImageBitmap && !getUrlFacade()) {
        const img = await loadImageElement(url);
        return createImageAsset(img, url);
    }

    if (supportsImageBitmap) {
        try {
            const bitmap = await loadBitmapFromElement(url);
            return createImageAsset(bitmap, url);
        } catch (error) {
            window.console?.warn?.(
                "ImageBitmap from HTMLImageElement failed, falling back to blob",
                url,
                error
            );
        }

        try {
            const blob = await fetchImageBlob(url);
            const bitmap = await createImageBitmap(blob);
            return createImageAsset(bitmap, url);
        } catch (error) {
            window.console?.warn?.("Falling back to HTMLImageElement for", url, error);
        }
    }

    const blob = await fetchImageBlob(url);
    const img = await loadImageFromBlob(blob, url);
    return createImageAsset(img, url);
};

/**
 * Fetches and parses a JSON resource. Used for atlas files.
 */
export const loadJson = async <T>(url: RequestInfo | URL): Promise<T> => {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
    }
    const text = await res.text();
    return JSON.parse(text) as T;
};
