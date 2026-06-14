import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

// Bundles every per-level JSON file under public/data/boxes/levels/ into a single
// levels.bundle.json keyed by "NN-LL". This collapses ~475 startup HTTP requests
// into one. Regenerated automatically via predev/prebuild; the result is committed
// so both dev and prod can fetch it directly.

const levelsDir = path.resolve(process.cwd(), "public", "data", "boxes", "levels");
const outputFile = path.resolve(process.cwd(), "public", "data", "boxes", "levels.bundle.json");

const LEVEL_FILE_RE = /^(\d{2})-(\d{2})\.json$/;

async function main() {
    let entries;
    try {
        entries = await fs.readdir(levelsDir, { withFileTypes: true });
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            console.warn(`bundleLevels: levels dir not found (${levelsDir}), skipping.`);
            return;
        }
        throw error;
    }

    const bundle = {};
    let count = 0;

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const match = entry.name.match(LEVEL_FILE_RE);
        if (!match) {
            continue;
        }
        const key = `${match[1]}-${match[2]}`;
        const raw = await fs.readFile(path.join(levelsDir, entry.name), "utf8");
        try {
            bundle[key] = JSON.parse(raw);
            count++;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`bundleLevels: skipping invalid JSON ${entry.name}: ${message}`);
        }
    }

    // Stable key order keeps the artifact diff-friendly.
    const ordered = {};
    for (const key of Object.keys(bundle).sort()) {
        ordered[key] = bundle[key];
    }

    await fs.writeFile(outputFile, JSON.stringify(ordered));
    console.log(`bundleLevels: wrote ${count} levels to ${path.relative(process.cwd(), outputFile)}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
