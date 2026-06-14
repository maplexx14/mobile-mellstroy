import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

// Trims the production dist/ of assets that are never requested at runtime, so
// deploys (e.g. Cloudflare Pages) upload far fewer files:
//   - per-level JSON (replaced by levels.bundle.json; only a dev fallback)
//   - unused image resolutions (only the 1920 set is active; see resolution.ts)
const distDir = path.resolve(process.cwd(), "dist");

const REMOVE = [
    "data/boxes/levels",
    "images/480",
    "images/768",
    "images/1024",
    "images/2560",
];

async function rmrf(rel) {
    const target = path.join(distDir, rel);
    try {
        await fs.rm(target, { recursive: true, force: true });
        console.log(`pruneDist: removed ${rel}`);
    } catch (error) {
        console.warn(`pruneDist: could not remove ${rel}:`, error?.message ?? error);
    }
}

async function main() {
    try {
        await fs.access(distDir);
    } catch {
        console.error("pruneDist: dist/ not found — run the build first.");
        process.exitCode = 1;
        return;
    }
    for (const rel of REMOVE) {
        await rmrf(rel);
    }
    const count = await countFiles(distDir);
    console.log(`pruneDist: dist now has ${count} files.`);
}

async function countFiles(dir) {
    let n = 0;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) n += await countFiles(full);
        else n++;
    }
    return n;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
