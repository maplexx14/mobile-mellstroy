/*
 * Copies the character video clips into the build output at /anims/out/.
 *
 * VideoCharacter loads `/anims/out/<name>.webm` (see VideoCharacter.ts). The
 * source clips live in the repo's top-level `anims/` folder, which Vite does
 * NOT copy (only `public/` is bundled). Without this step the deployed site
 * 404s every clip and the character never appears. Run as part of build:pages.
 *
 * `win` has no dedicated source clip, so the celebratory `excited` clip stands
 * in for it.
 */
import fs from "node:fs";
import path from "node:path";

// out-name -> source file in anims/
const MAP = {
    idle: "idle1.webm",
    idle2: "idle2.webm",
    idle3: "idle3.webm",
    excited: "excited.webm",
    win: "excited.webm",
    fail: "fail.webm",
    chew: "chew.webm",
};

const srcDir = "anims";
const outDir = path.join("dist", "anims", "out");

fs.mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const [outName, srcName] of Object.entries(MAP)) {
    const src = path.join(srcDir, srcName);
    const dst = path.join(outDir, `${outName}.webm`);
    if (!fs.existsSync(src)) {
        console.warn(`copyAnims: missing source ${src}, skipping ${outName}`);
        continue;
    }
    fs.copyFileSync(src, dst);
    copied++;
}

console.log(`copyAnims: copied ${copied} clip(s) to ${outDir}`);
