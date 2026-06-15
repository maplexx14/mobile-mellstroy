# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server (localhost:5173) — runs prebuild first
npm run build        # Production build: vite build + compress JSON + bundle levels
npm run typecheck    # TypeScript type check (no emit)
npm run lint         # ESLint on *.ts files
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format all files
npm run format:check # Check Prettier formatting
npm run preview      # Preview production build locally
```

Level data must be bundled before running dev or building — `predev`/`prebuild` scripts do this automatically via `scripts/bundleLevels.js`.

## Architecture

This is a browser-based HTML5 puzzle game ("Cut the Rope") built with TypeScript and rendered on a Canvas 2D context (no external graphics library).

### Controller-View State Machine

The game uses a hierarchical MVC-inspired pattern:

- `core/ViewController.ts` — base class with an INACTIVE → ACTIVE → PAUSED state machine; all game entities extend this
- `game/CTRRootController.ts` — top-level controller managing MENU / LOADING / GAME states
- `game/GameController.ts` — manages a single active game session
- `ctr.ts` → `app.ts` → `CTRRootController` is the boot sequence

### Event System

Loose coupling is achieved via `utils/PubSub.ts` with 41+ named channels (`LevelWon`, `LevelLost`, `PauseGame`, `LanguageChanged`, etc.). Subscribers get handles for cleanup. This is the primary communication path between physics, game logic, and UI.

### Physics Engine

A custom Verlet integration engine lives in `physics/`:
- `MaterialPoint.ts` — physics particles
- `ConstraintSystem.ts` — constraint solver (ropes, sticks)
- The rope-cutting mechanic works by deleting constraints from this system

Physics ticks at a fixed 1/60 s timestep inside `ViewController.update(dt)`.

### Asset Pipeline

Assets are loaded in two phases:
1. `resources/PreLoader.ts` — synchronous critical assets (menu + first level)
2. `resources/DeferredLoader.ts` — async loading of remaining content

`TextureAtlasParser.ts` handles TexturePacker atlases. PWA caching (Workbox) applies different strategies per asset type (NetworkFirst for HTML, CacheFirst for images, StaleWhileRevalidate for scripts).

### Resolution & Localization

- `config/resolutions/` — multiple resolution presets; viewport scaling is managed via zoom
- CSS classes (`ui-1920`, `ui-768`) are applied to the root element for layout breakpoints
- Language-specific fonts (`Playpen Sans`, `Cafe24`, etc.) are loaded on demand in `ctr.ts` and trigger a UI re-render via PubSub `LanguageChanged`

### Level Data

Level JSON files are merged by `scripts/bundleLevels.js` and compressed by `scripts/compressJson.js` during build. The raw JSON lives in the repository; the bundled output is an artifact.

## Code Style

- **Prettier**: 100-char line width, 4-space indent, double quotes, semicolons required
- **TypeScript strict mode**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` are all enabled — handle these carefully
- **Path alias**: `@/*` resolves to `./src/*`
- **ESLint**: 1TBS brace style, all blocks must have braces (`curly: all`)
