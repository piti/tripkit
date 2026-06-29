# TripKit Trip Video (Remotion) — Design Spec

**Status:** Approved design, pre-implementation
**Date:** 2026-06-27
**Phase:** 2 of the media work (Phase 1 = post-trip interactive media map, shipped as `tripkit@1.4.0`)

## Context

TripKit turns a planning YAML into an interactive HTML map. Phase 1 added post-trip media:
`tripkit media` ingests a folder of geotagged photos/videos, EXIF-matches them to stops, and
the renderer shows per-stop galleries, a lightbox, photo-pin map layer, and marker badges.
The data now carries the trip's *actual* captured media (`stops[].media[]`).

Phase 2 makes that data **move**: an opt-in renderer that turns the same media-populated
`trip.yaml` into a narrated trip-recap **video** — a map that flies between locations drawing
the route, photo montages per stop, animated title cards, captions, background music, and
optional first-person TTS narration. Teased publicly as "the next phase makes it move."

This is a deliberately separate cycle from Phase 1 because it introduces a heavy, opt-in
toolchain (React + Remotion + headless Chrome + ffmpeg) that must NOT touch the lean core
`tripkit` package.

### Decisions locked during brainstorming
- **Map in video:** pre-fetched **static map tile images**, animated with CSS transforms (not a live JS map) — deterministic, reliable frame capture.
- **Timeline:** **map fly + photo montage per stop**, day by day. The map is connective tissue between photo sequences.
- **Workflow:** **build step → MP4** (`npm run video -- trip.yaml out.mp4`). Headless/scriptable. (Remotion Studio remains available for anyone who wants to preview, but isn't the documented path.)
- **Narration:** opt-in (`--narrate`), **agent-written script** in a reviewable artifact, then TTS. Default OFF (no key needed).
- **Narration voice:** **first-person plural ("we/our")** — a personal travelogue from the traveler's POV, grounded in the trip's real stops, photo captions, and iteration log. Not second-person tour-guide.
- **TTS:** **pluggable adapter** (text → audio file), default one impl behind an env key.
- **Music:** **both** — user-supplied file (`--music <file>`) with a bundled royalty-free **default**, and AI-generated (`--music ai`) via a pluggable music adapter.
- **Tiles:** **pluggable tile-source adapter**, default **MapTiler** (free key, env var), license-clean for distributed video. Esri documented as a non-commercial-only fallback.
- **Extra features (all in v1):** animated route-line draw, burned-in narration subtitles, title/location cards + transitions, cinematic polish (motion blur + camera drift).
- **Package boundary:** lives entirely in `renderers/remotion/` as its own opt-in npm package. Core `tripkit` stays js-yaml + exifr (+ optional sharp).

### Licensing notes surfaced by research (must be documented)
- **Remotion license:** free for individuals, non-profits, and companies ≤3 employees; 4+ needs a paid Company License (remotion.pro). Users render under their own license. Document in the sub-package README.
- **Tiles in video:** baking tiles into a distributed MP4 is stricter than live web display. Esri's public tiles are **not** cleared for commercial video; the public OSM tile server **prohibits** the bulk/headless pre-fetching a render pipeline does. Hence the MapTiler/Stadia default with attribution, Esri as non-commercial-only.

## Architecture: prepare → render

```
trip.yaml  (media-populated, from Phase 1)
   │
   │  [optional]  npm run narrate -- trip.yaml   → trip.narration.yaml   (agent writes first-person prose)
   ▼
renderers/remotion/   (own package.json — opt-in: cd renderers/remotion && npm install)
   ├─ PREPARE (Node; ALL async / network / non-deterministic work)
   │     read trip.yaml + narration → fetch+stitch static map tiles (tile adapter) →
   │     project lat/lng→pixel → run TTS adapter (if --narrate) → whisper captions →
   │     resolve music (file | ai | default) → emit video-props.json + assets/
   ├─ RENDER (React/Remotion; PURE + deterministic — reads only video-props.json)
   │     MapFly + route-line draw + PhotoMontage + TitleCard + Subtitles + Audio + polish
   └─ npm run video -- trip.yaml out.mp4 [flags]   → prepare + render → trip.mp4
```

**Core principle (carried from Phase 1's review-then-render pattern):** every network/AI/file
operation happens in the **prepare** step and is baked into a static `video-props.json` plus a
local `assets/` folder. The Remotion composition is pure — frame `N` is fully determined by the
props — so parallel headless-Chrome capture can't render blank frames from async tile/audio loads.

## Components

All under `renderers/remotion/`.

### Prepare (`prepare/`, plain Node)
- `read-trip.js` — load media-populated `trip.yaml` + optional `trip.narration.yaml`; validate shape.
- `projection.js` — Web Mercator `latLngToPixel(lat, lng, zoom, originWorldXY)` and inverse. Clamp lat to ±85.05113°. Unit-testable against known reference values.
- `map-tiles.js` — for each stop and each fly-between segment, compute a bounding box + zoom, stitch a static PNG via **`staticmaps`** (npm; uses `sharp`) pointed at the **tile adapter**. Cache by bbox+zoom hash. Emit each segment's pixel-space route points (via `projection.js`).
- `adapters/tiles.js` — interface `getTileUrlTemplate(provider) → "{z}/{x}/{y}"-style URL` (+ attribution string). Default **MapTiler** (env `MAPTILER_KEY`); `esri` option (non-commercial, on-screen attribution); pluggable.
- `adapters/tts.js` — interface `synthesize(text, opts) → audioFilePath`. One default impl behind an env key. Cache per stop. Only runs with `--narrate`.
- `adapters/music.js` — resolve `--music <file>` | `--music ai` (gen adapter) | bundled royalty-free default → a single audio file path.
- `captions.js` — with narration: `@remotion/install-whisper-cpp` → `transcribe` → `@remotion/captions` `toCaptions` → `Caption[]` per stop. Optional/graceful (skip subtitles with a notice if whisper unavailable).
- `narration-scaffold.js` — generate `trip.narration.yaml`: one entry per stop `{ day, stop_index, stop, script }` pre-filled from `description` + media captions, for the agent/user to rewrite.
- `build-props.js` — assemble `video-props.json`: ordered segments with durations (narration-synced), map PNG refs, pixel route points, photo lists, captions, title text, audio refs.

### Render (`src/`, React/Remotion)
- `Trip.tsx` — root `<Composition>`; `calculateMetadata` (async) sums per-segment durations, syncing each narrated segment to its audio via `getAudioDurationInSeconds`.
- `MapFly.tsx` — static map PNG under a `transform` driven by **`d3.interpolateZoom`** (van Wijk "zoom out → arc → zoom in", rho ≈ 1.42); SVG route `<path>` revealed with **`@remotion/paths`** (`evolvePath` → strokeDashoffset) and a marker placed via `getPointAtLength` / rotated via `getTangentAtLength`, the line head and camera target driven by the same progress `p`.
- `PhotoMontage.tsx` — Ken Burns `<Img>` (scale/translate via `interpolate`, `overflow:hidden` + `objectFit:cover`), sequences joined by **`@remotion/transitions`** (`fade` / `crossZoom` / `dreamyZoom`). Stops without media skip the montage.
- `TitleCard.tsx` — day/stop title cards using **`@remotion/google-fonts`** (`waitUntilDone()`) + **`@remotion/layout-utils`** (`fitText`) to auto-size place names.
- `Subtitles.tsx` — render the per-stop `Caption[]` synced to narration (highlight current token via `fromMs`/`toMs`). Burned-in for silent/social autoplay + accessibility.
- `audio` — narration + music `<Audio>` (from `@remotion/media`), music ducked under narration via a `volume={(frame)=>…}` callback.
- Polish — **`@remotion/motion-blur`** (`<CameraMotionBlur>`) on fast flys; **`@remotion/noise`** (`noise2D`) subtle handheld drift on photos/map.

### Commands (in `renderers/remotion/`)
- `npm run narrate -- ../../trip.yaml` → scaffold `trip.narration.yaml` (skip if no narration wanted).
- `npm run video -- ../../trip.yaml out.mp4 [--narrate] [--music <file|ai>] [--tiles <provider>]` → prepare + render via `@remotion/renderer` (`selectComposition` + `renderMedia`).

## Data flow & the narration artifact

The narration uses the **same review-in-the-middle pattern as Phase 1's media flow**:

```
trip.yaml ──(--narrate)──► trip.narration.yaml  ←── agent writes first-person prose
   per stop: { day, stop_index, stop, script: "We crested the ridge and there it was — Multnomah Falls…" }
        │  you read / edit
        ▼
prepare ──► video-props.json + assets/  ──► remotion render ──► trip.mp4
```

**Agent role — new Phase 6 in `agent/SKILL.md`:** given `trip.narration.yaml`, write concise,
vivid, **first-person plural ("we/our")** narrator prose per stop — grounded in the stop's
`description`, the real photo `caption`s from Phase 1, and the trip's `iteration_log` so it reads
like a genuine recollection, not generic travel copy. Pace ~1 sentence per few seconds of the
stop's montage. Same philosophy as media-review captioning: a plain-text file you approve before
anything renders.

## Error handling (graceful degradation)
- **Stop with no media** → still gets its map-fly + title card; no montage. Zero-media trip → valid route-flyover video.
- **No `--narrate`** → captions-from-data + music only; no key needed. `--narrate` with no TTS key → clear error *before* any render work.
- **Tile fetch fails** (rate-limit / bad key) → fail in *prepare* with an actionable message; never a half-rendered MP4.
- **Whisper unavailable** → narration still plays; subtitles skipped with a notice (the "optional, graceful" pattern, like `sharp` in Phase 1).
- **Missing music/fonts** → bundled royalty-free default; `google-fonts` `waitUntilDone()` so text never renders unstyled.

## Testing
- **Prepare (pure Node, in CI):** unit-test `latLngToPixel` vs known Web-Mercator references; assert `video-props.json` per-segment durations + asset refs; assert narration-scaffold emits one entry per stop.
- **Adapters:** test tile/TTS/music interfaces with stub impls (no real API in CI); assert a missing key degrades correctly.
- **Render smoke (local/CI-light):** `selectComposition` + a single-frame `renderStill` of a tiny fixture trip — verifies the React tree mounts deterministically without a full MP4.
- **Full MP4 render:** manual/local (heavy: headless Chrome + ffmpeg). Document the command.
- **Isolation:** all of the above run in `renderers/remotion/`. The lean core `tripkit` test suite is untouched.

## Critical files / new structure
```
renderers/remotion/
  package.json              # own deps: remotion + @remotion/{paths,transitions,captions,
                            #   install-whisper-cpp,google-fonts,layout-utils,motion-blur,
                            #   noise,media,renderer,bundler}, staticmaps, d3-interpolate
  README.md                 # setup, licensing notes (Remotion license + tile licensing), commands
  remotion.config.ts
  prepare/                  # read-trip, projection, map-tiles, captions, narration-scaffold, build-props
  prepare/adapters/         # tiles, tts, music (pluggable)
  src/                      # Trip.tsx (+ MapFly, PhotoMontage, TitleCard, Subtitles), index.ts
  assets/                   # bundled default music; generated maps/audio (gitignored)
  scripts/                  # narrate.js, video.js (CLI entry points)
```
Touches in core repo: `agent/SKILL.md` (Phase 6 narration), `README.md` (link to the video renderer), `.planning/ROADMAP.md` (mark the Remotion item in progress/done), `CHANGELOG.md` `[Unreleased]`. **No core dependency or version changes.**

## New dependencies (all inside `renderers/remotion/` only)
- `remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`
- `@remotion/paths`, `@remotion/transitions`, `@remotion/captions`, `@remotion/install-whisper-cpp`, `@remotion/google-fonts`, `@remotion/layout-utils`, `@remotion/motion-blur`, `@remotion/noise`, `@remotion/media`, `@remotion/media-utils`
- `staticmaps` (tile stitching; uses `sharp`), `d3-interpolate` (van Wijk camera)
- TTS/music adapters: provider SDK or `fetch` per the default impl (behind env keys)

## Verification (end-to-end)
1. **Prepare unit tests** green (`projection`, props durations, scaffold).
2. **Scaffold + narrate:** `npm run narrate -- fixture.yaml` produces a `trip.narration.yaml` with one first-person-ready entry per stop; edit a couple.
3. **No-narration render:** `npm run video -- fixture.yaml out.mp4` (captions + default music) produces a playable MP4 with map flys, route-line draw, photo montages, title cards.
4. **Narrated render:** `npm run video -- fixture.yaml out.mp4 --narrate --music ai` produces an MP4 with first-person voiceover, burned-in synced subtitles, AI music ducked under narration.
5. **Single-frame smoke test** passes in CI (no full MP4).
6. **Graceful paths:** zero-media trip still renders a route flyover; `--narrate` without a key errors clearly before rendering; whisper-absent skips subtitles with a notice.
7. **Core untouched:** core `tripkit` `npm test` still green; no new core deps.

## Out of scope (future)
- Cloud render (`@remotion/lambda`) — note it exists; no GPU there (slow for maps).
- Vertical/social aspect-ratio presets (9:16) — v1 targets 16:9.
- Live/3D map (Mapbox/MapLibre/deck.gl) — static-tile approach is the v1 decision.
- React renderer media support (separate track).
