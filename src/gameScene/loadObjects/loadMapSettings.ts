import resolution from "@/resolution";
import LevelState from "@/game/LevelState";
import edition from "@/config/editions/net-edition";
import EarthImage from "@/game/EarthImage";
import type GameSceneLoaders from "../loaders";
import type { MapSettingsItem } from "../MapLayerItem";

/**
 * Loads the map settings for the map node (inside settings layer)
 */
export function loadMapSettings(this: GameSceneLoaders, item: MapSettingsItem): void {
    this.mapWidth = item.width;
    this.mapHeight = item.height;
    this.PMX = (resolution.CANVAS_WIDTH - this.mapWidth * this.PM) / 2;
    // Centre the level vertically the same way PMX centres it horizontally. For the
    // landscape profile the level height equals the canvas height so this stays 0;
    // for the taller portrait canvas it places the level in the middle with the
    // cardboard background filling above and below.
    this.PMY = resolution.PMY + (resolution.CANVAS_HEIGHT - this.mapHeight * this.PM) / 2;
    this.mapWidth *= this.PM;
    this.mapHeight *= this.PM;

    if (edition.showEarth[LevelState.pack]) {
        if (this.mapWidth > resolution.CANVAS_WIDTH) {
            this.earthAnims.push(new EarthImage(resolution.CANVAS_WIDTH, 0));
        }
        if (this.mapHeight > resolution.CANVAS_HEIGHT) {
            this.earthAnims.push(new EarthImage(0, resolution.CANVAS_HEIGHT));
        }
        this.earthAnims.push(new EarthImage(0, 0));
    }
}
