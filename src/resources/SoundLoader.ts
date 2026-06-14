import platform from "@/config/platforms/platform-web";
import edition from "@/config/editions/net-edition";
import resData from "@/resources/ResData";
import ResourceId from "@/resources/ResourceId";
import Sounds from "@/resources/Sounds";
import { getAudioContext } from "@/utils/audioContext";
import { soundRegistry } from "@/utils/soundRegistry";

// Large background-music tracks (~1 MB+ each). They don't need to gate the menu:
// the menu only needs the tiny tap/button UI sounds to be interactive. Music
// streams in afterwards so a slow connection can't keep the menu off-screen.
const BACKGROUND_MENU_SOUND_IDS = new Set<number>([
    ResourceId.SND_MENU_MUSIC,
    ResourceId.SND_MENU_MUSIC_XMAS,
    ResourceId.SND_TIME_MENU_MUSIC,
]);

const decodeAudioBuffer = (context: BaseAudioContext, arrayBuffer: ArrayBuffer) => {
    return new Promise<AudioBuffer>((resolve, reject) => {
        let decodePromise: Promise<AudioBuffer> | undefined;
        try {
            decodePromise = context.decodeAudioData(
                arrayBuffer,
                (buffer) => resolve(buffer),
                (error) => reject(error)
            );
        } catch (error) {
            reject(error);
            return;
        }
        if (decodePromise && typeof decodePromise.then === "function") {
            decodePromise.then(resolve).catch(reject);
        }
    });
};

type CompletionListener = () => void;
type ProgressListener = (completed: number, total: number) => void;

class SoundLoader {
    private readonly completeListeners: CompletionListener[] = [];

    private readonly progressListeners: ProgressListener[] = [];

    private startRequested = false;

    private soundManagerReady = false;

    private hasStartedLoading = false;

    private currentCompleted = 0;

    private currentFailed = 0;

    private currentTotal = 0;

    constructor() {
        Sounds.onReady(() => {
            this.soundManagerReady = true;
            void this.startIfReady();
        });
    }

    start(): void {
        this.startRequested = true;
        void this.startIfReady();
    }

    onMenuComplete(callback: CompletionListener): void {
        this.completeListeners.push(callback);
    }

    onProgress(callback: ProgressListener): void {
        this.progressListeners.push(callback);
        if (this.currentTotal > 0) {
            try {
                callback(this.currentCompleted, this.currentTotal);
            } catch (error) {
                window.console?.error?.("Sound progress listener failed", error);
            }
        }
    }

    getSoundCount(): number {
        // Only the small critical menu (UI) sounds gate the menu / progress bar.
        // Menu music and game sounds load in the background (see startIfReady).
        return edition.menuSoundIds.filter((id) => !BACKGROUND_MENU_SOUND_IDS.has(id)).length;
    }

    private loadSingleSound = async (
        context: BaseAudioContext,
        baseUrl: string,
        extension: string,
        id: number
    ): Promise<void> => {
        const resource = resData[id];
        if (!resource) {
            throw new Error(`Resource not found for sound ID: ${id}`);
        }

        const soundKey = `s${id}`;
        const soundUrl = baseUrl + resource.path + extension;

        const response = await fetch(soundUrl);
        if (!response.ok) {
            throw new Error(`Failed to load audio: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await decodeAudioBuffer(context, arrayBuffer);

        const gainNode = context.createGain();
        gainNode.connect(context.destination);

        soundRegistry.set(soundKey, {
            buffer: audioBuffer,
            gainNode,
            playingSources: new Set<AudioBufferSourceNode>(),
            isPaused: false,
            volume: 1,
        });
    };

    private startIfReady = async (): Promise<void> => {
        if (!this.startRequested || !this.soundManagerReady || this.hasStartedLoading) {
            return;
        }

        this.hasStartedLoading = true;

        const baseUrl = platform.audioBaseUrl;
        const extension = platform.getAudioExtension();
        const context = getAudioContext();

        // Critical = tiny UI sounds that gate the menu. Everything else (menu
        // music + game sounds) streams in afterwards without blocking.
        const criticalMenuSoundIds = edition.menuSoundIds.filter(
            (id) => !BACKGROUND_MENU_SOUND_IDS.has(id)
        );
        const backgroundSoundIds = [
            ...edition.menuSoundIds.filter((id) => BACKGROUND_MENU_SOUND_IDS.has(id)),
            ...edition.gameSoundIds,
        ];

        this.currentTotal = criticalMenuSoundIds.length;
        this.currentCompleted = 0;
        this.currentFailed = 0;

        const notifyProgress = () => {
            for (const listener of this.progressListeners) {
                try {
                    listener(this.currentCompleted, this.currentTotal);
                } catch (error) {
                    window.console?.error?.("Sound progress listener failed", error);
                }
            }
        };

        const notifyComplete = () => {
            for (const listener of this.completeListeners) {
                try {
                    listener();
                } catch (error) {
                    window.console?.error?.("Sound completion listener failed", error);
                }
            }
        };

        // Background-load menu music + game sounds without gating the menu.
        // Missing sounds are handled gracefully at playback time, and these are
        // only needed after the menu is already on-screen.
        const loadSoundsInBackground = () => {
            if (!context || backgroundSoundIds.length === 0) {
                return;
            }
            void Promise.all(
                backgroundSoundIds.map((id) =>
                    this.loadSingleSound(context, baseUrl, extension, id).catch((error) => {
                        window.console?.error?.("Failed to load background audio", id, error);
                    })
                )
            );
        };

        if (!context || this.currentTotal === 0) {
            this.currentCompleted = this.currentTotal;
            notifyProgress();
            notifyComplete();
            loadSoundsInBackground();
            return;
        }

        await Promise.all(
            criticalMenuSoundIds.map((id) =>
                this.loadSingleSound(context, baseUrl, extension, id)
                    .then(() => {
                        this.currentCompleted++;
                        notifyProgress();
                    })
                    .catch((error) => {
                        this.currentFailed++;
                        window.console?.error?.("Failed to load audio", id, error);
                        notifyProgress();
                    })
            )
        );

        if (this.currentFailed > 0) {
            window.console?.warn?.(
                `Menu sound loading completed with ${this.currentFailed} failure(s) out of ${this.currentTotal} total`
            );
        }

        // Menu is no longer blocked; let music + game sounds stream in afterwards.
        notifyComplete();
        loadSoundsInBackground();
    };
}

export default new SoundLoader();
