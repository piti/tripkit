# Trip Video (Remotion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in renderer that turns a media-populated `trip.yaml` into a narrated trip-recap MP4 — a map that flies between stops drawing the route, per-stop photo montages, title cards, burned-in subtitles, music, and optional first-person TTS narration.

**Architecture:** A new self-contained npm package at `renderers/remotion/`. A **prepare** stage (plain Node) does all async/network/non-deterministic work — stitch static map tiles, project lat/lng→pixels, synthesize TTS, transcribe captions, resolve music — and bakes everything into one `video-props.json` plus a local `assets/` folder. A **render** stage (React/Remotion) is pure: it reads only `video-props.json`, so every frame is reproducible under parallel headless-Chrome capture.

**Tech Stack:** Node 18+, Remotion 4.0.484 (`remotion`, `@remotion/{cli,renderer,bundler,paths,transitions,captions,install-whisper-cpp,google-fonts,layout-utils,motion-blur,noise,media,media-utils}`), `staticmaps@1.13.1` (tile stitching, uses sharp), `d3-interpolate@3.0.1` (van Wijk camera), `js-yaml`, `vitest` for prepare-stage tests, TypeScript for the Remotion side.

## Global Constraints

- **Package isolation:** ALL new dependencies live in `renderers/remotion/package.json`. The core `tripkit` package (`/package.json`) gets NO new deps and NO version bump from this work.
- **Determinism:** the Remotion composition (`src/`) must read only from `video-props.json` / bundled assets. No network, no `Date.now()`, no `Math.random()` (use Remotion's seeded `random()` / `@remotion/noise`) inside components. All async work happens in `prepare/`.
- **Remotion version lock:** every `@remotion/*` package MUST be exactly `4.0.484` (they version-lock together). Pin with exact versions (no `^`).
- **Narration voice:** first-person plural ("we/our"), grounded in the trip's real stops, photo captions, and `iteration_log`. Never second-person tour-guide.
- **Tile licensing:** default tile provider is **MapTiler** (env `MAPTILER_KEY`), license-clean for distributed video. `esri` is a documented non-commercial-only fallback with on-screen attribution. Document Remotion's company-license terms (free ≤3 employees) in the sub-package README.
- **Graceful degradation:** missing media / narration / whisper / music must degrade with a clear notice, never a crash or half-rendered MP4. Errors that block rendering must fail in the prepare stage with an actionable message.
- **Aspect ratio:** 16:9 (1920×1080, 30fps) for v1.
- **Node module style:** `renderers/remotion/` uses ESM + TypeScript (`"type": "module"`), separate from the core package's CommonJS. Prepare-stage files are `.ts` run via `tsx`; tests use `vitest`.

---

## File Structure

```
renderers/remotion/
  package.json            # own deps (Remotion 4.0.484 + staticmaps + d3-interpolate + tsx/vitest/typescript)
  tsconfig.json
  remotion.config.ts      # Remotion CLI config (codec, image format)
  README.md               # setup, licensing (Remotion + tiles), commands
  .gitignore              # assets/generated, out/, node_modules

  prepare/
    types.ts              # shared TS types: TripData, VideoProps, Segment, etc.
    projection.ts         # Web Mercator latLngToPixel / pixelToLatLng
    read-trip.ts          # load+shape trip.yaml (+ optional narration.yaml)
    map-tiles.ts          # stitch a static PNG per segment via staticmaps; pixel route points
    build-props.ts        # assemble video-props.json (durations, assets, segments)
    narration-scaffold.ts # emit trip.narration.yaml (one entry per stop)
    captions.ts           # whisper transcription → Caption[] (optional/graceful)
    adapters/
      tiles.ts            # tile-source adapter (MapTiler default, esri fallback)
      tts.ts              # TTS adapter interface + default impl + stub
      music.ts            # music resolver: file | ai | bundled default

  src/
    index.ts              # registerRoot
    Root.tsx              # <Composition> registration + calculateMetadata
    Trip.tsx              # top-level sequence of segments
    components/
      MapFly.tsx          # static map + d3 van Wijk camera + @remotion/paths route draw
      PhotoMontage.tsx    # Ken Burns imgs + @remotion/transitions
      TitleCard.tsx       # day/stop cards (google-fonts + layout-utils)
      Subtitles.tsx       # Caption[] renderer

  scripts/
    narrate.ts            # CLI: scaffold trip.narration.yaml
    video.ts              # CLI: prepare + render → mp4

  assets/
    music/default.mp3     # bundled royalty-free track (placeholder until sourced)
    generated/            # gitignored: stitched maps, tts audio, resolved music

  tests/
    projection.test.ts
    build-props.test.ts
    narration-scaffold.test.ts
    adapters.test.ts
    fixtures/mini-trip.yaml

Touched in core repo (no dep/version changes):
  agent/SKILL.md          # add Phase 6 (narration)
  README.md               # link to the video renderer
  .planning/ROADMAP.md    # mark Remotion item in progress→done
  CHANGELOG.md            # [Unreleased] note
```

---

## Task 1: Sub-package scaffold

**Files:**
- Create: `renderers/remotion/package.json`
- Create: `renderers/remotion/tsconfig.json`
- Create: `renderers/remotion/.gitignore`
- Create: `renderers/remotion/vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an installable, test-runnable ESM+TS package. Later tasks add files and run `npx vitest` / `npx tsx`.

- [ ] **Step 1: Create `renderers/remotion/package.json`**

```json
{
  "name": "@tripkit/remotion-renderer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "TripKit video renderer — turns a trip.yaml into a narrated trip-recap MP4 (opt-in, Remotion-based).",
  "scripts": {
    "test": "vitest run",
    "narrate": "tsx scripts/narrate.ts",
    "video": "tsx scripts/video.ts",
    "studio": "remotion studio src/index.ts"
  },
  "dependencies": {
    "@remotion/bundler": "4.0.484",
    "@remotion/captions": "4.0.484",
    "@remotion/cli": "4.0.484",
    "@remotion/google-fonts": "4.0.484",
    "@remotion/install-whisper-cpp": "4.0.484",
    "@remotion/layout-utils": "4.0.484",
    "@remotion/media": "4.0.484",
    "@remotion/media-utils": "4.0.484",
    "@remotion/motion-blur": "4.0.484",
    "@remotion/noise": "4.0.484",
    "@remotion/paths": "4.0.484",
    "@remotion/renderer": "4.0.484",
    "@remotion/transitions": "4.0.484",
    "remotion": "4.0.484",
    "d3-interpolate": "3.0.1",
    "js-yaml": "4.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "staticmaps": "1.13.1"
  },
  "devDependencies": {
    "@types/d3-interpolate": "3.0.4",
    "@types/js-yaml": "4.0.9",
    "@types/react": "19.0.0",
    "tsx": "4.19.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `renderers/remotion/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "prepare", "scripts", "tests"]
}
```

- [ ] **Step 3: Create `renderers/remotion/.gitignore`**

```gitignore
node_modules/
assets/generated/
out/
*.mp4
```

- [ ] **Step 4: Create `renderers/remotion/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 5: Install and verify**

Run: `cd renderers/remotion && npm install`
Expected: installs without error; `node_modules/` populated. (Note: Remotion downloads a headless-Chrome build on first render, not at install.)

- [ ] **Step 6: Commit**

```bash
git add renderers/remotion/package.json renderers/remotion/tsconfig.json renderers/remotion/.gitignore renderers/remotion/vitest.config.ts
git commit -m "feat(video): scaffold renderers/remotion sub-package"
```

---

## Task 2: Web Mercator projection

**Files:**
- Create: `renderers/remotion/prepare/projection.ts`
- Test: `renderers/remotion/tests/projection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TILE_SIZE = 256`
  - `worldSize(zoom: number): number` → `256 * 2 ** zoom`
  - `latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number }` — pixel in the full world image at `zoom`.
  - `latLngToPixel(lat, lng, zoom, origin: {x:number;y:number}): {x:number;y:number}` — world pixel minus image top-left origin.
  - `MAX_LAT = 85.05112878`

- [ ] **Step 1: Write the failing test**

`renderers/remotion/tests/projection.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { latLngToWorld, latLngToPixel, worldSize, MAX_LAT } from '../prepare/projection';

describe('projection', () => {
  it('puts (0,0) at the center of the zoom-0 world (128,128)', () => {
    const p = latLngToWorld(0, 0, 0);
    expect(p.x).toBeCloseTo(128, 6);
    expect(p.y).toBeCloseTo(128, 6);
  });

  it('matches a known reference point (SF at zoom 0)', () => {
    const p = latLngToWorld(37.7749, -122.4194, 0);
    expect(p.x).toBeCloseTo(40.9462, 3);
    expect(p.y).toBeCloseTo(98.9494, 3);
  });

  it('scales by 2^zoom', () => {
    expect(worldSize(0)).toBe(256);
    expect(worldSize(10)).toBe(262144);
    const p = latLngToWorld(37.7749, -122.4194, 10);
    expect(p.x).toBeCloseTo(41928.9133, 2);
  });

  it('subtracts the image origin', () => {
    const p = latLngToPixel(0, 0, 0, { x: 100, y: 100 });
    expect(p.x).toBeCloseTo(28, 6);
    expect(p.y).toBeCloseTo(28, 6);
  });

  it('clamps latitude to the Web Mercator limit', () => {
    const beyond = latLngToWorld(89, 0, 0);
    const atLimit = latLngToWorld(MAX_LAT, 0, 0);
    expect(beyond.y).toBeCloseTo(atLimit.y, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd renderers/remotion && npx vitest run tests/projection.test.ts`
Expected: FAIL — cannot resolve `../prepare/projection`.

- [ ] **Step 3: Write minimal implementation**

`renderers/remotion/prepare/projection.ts`:
```ts
export const TILE_SIZE = 256;
export const MAX_LAT = 85.05112878;

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

export function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const size = worldSize(zoom);
  const x = ((lng + 180) / 360) * size;
  const sin = Math.sin((clamped * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return { x, y };
}

export function latLngToPixel(
  lat: number,
  lng: number,
  zoom: number,
  origin: { x: number; y: number }
): { x: number; y: number } {
  const w = latLngToWorld(lat, lng, zoom);
  return { x: w.x - origin.x, y: w.y - origin.y };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd renderers/remotion && npx vitest run tests/projection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add renderers/remotion/prepare/projection.ts renderers/remotion/tests/projection.test.ts
git commit -m "feat(video): Web Mercator projection helpers"
```

---

## Task 3: Shared types + trip reader

**Files:**
- Create: `renderers/remotion/prepare/types.ts`
- Create: `renderers/remotion/prepare/read-trip.ts`
- Create: `renderers/remotion/tests/fixtures/mini-trip.yaml`
- Test: `renderers/remotion/tests/read-trip.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types: `Stop { name; lat; lng; type?; label?; description?; media?: MediaItem[] }`, `MediaItem { src; type: 'photo'|'video'; thumb?; caption?; lat?; lng?; taken_at? }`, `Day { number; title; date; color?; stops: Stop[]; lodging?: {name;lat?;lng?} }`, `Trip { trip: {...}; days: Day[] }`, `NarrationEntry { day:number; stop_index:number; stop:string; script:string }`.
  - `readTrip(path: string): Trip`
  - `readNarration(path: string): NarrationEntry[]` (returns `[]` if file absent)
  - `flattenStops(trip: Trip): {day:number; stopIndex:number; dayColor:string; stop:Stop}[]` — ordered, only stops with finite lat/lng.

- [ ] **Step 1: Write the fixture**

`renderers/remotion/tests/fixtures/mini-trip.yaml`:
```yaml
trip:
  title: "Test Trip"
  dates: "May 15-16, 2026"
  total_days: 2
  origin: "Fresno, CA"
  origin_lat: 36.7378
  origin_lng: -119.7871
days:
  - number: 1
    title: "Valley Floor"
    date: "Friday, May 15"
    color: "#2e7db5"
    stops:
      - name: "Lower Yosemite Fall"
        lat: 37.7561
        lng: -119.5966
        type: hike
        description: "Easy 1-mile loop to the base of the lower fall."
        media:
          - src: "media/fall_01.jpg"
            type: photo
            caption: "Roaring with May snowmelt"
            lat: 37.7560
            lng: -119.5965
      - name: "Tunnel View"
        lat: 37.7159
        lng: -119.6770
        type: scenic
        description: "The classic Yosemite panorama."
  - number: 2
    title: "Mariposa Grove"
    date: "Saturday, May 16"
    color: "#2d7a50"
    stops:
      - name: "Mariposa Grove"
        lat: 37.5142
        lng: -119.6010
        type: hike
        description: "Giant sequoias on the lower loop."
```

- [ ] **Step 2: Write the failing test**

`renderers/remotion/tests/read-trip.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTrip, flattenStops } from '../prepare/read-trip';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'mini-trip.yaml');

describe('read-trip', () => {
  it('loads the trip and its days', () => {
    const trip = readTrip(fixture);
    expect(trip.trip.title).toBe('Test Trip');
    expect(trip.days).toHaveLength(2);
  });

  it('flattens stops in order with day context', () => {
    const flat = flattenStops(readTrip(fixture));
    expect(flat).toHaveLength(3);
    expect(flat[0].stop.name).toBe('Lower Yosemite Fall');
    expect(flat[0].day).toBe(1);
    expect(flat[0].stopIndex).toBe(0);
    expect(flat[0].dayColor).toBe('#2e7db5');
    expect(flat[2].stop.name).toBe('Mariposa Grove');
    expect(flat[2].day).toBe(2);
  });

  it('drops stops without finite coordinates', () => {
    const flat = flattenStops({
      trip: { title: 't' },
      days: [{ number: 1, title: 'd', date: 'x', stops: [
        { name: 'ok', lat: 1, lng: 2 },
        { name: 'bad', lat: NaN as unknown as number, lng: 2 },
      ] }],
    } as never);
    expect(flat).toHaveLength(1);
    expect(flat[0].stop.name).toBe('ok');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd renderers/remotion && npx vitest run tests/read-trip.test.ts`
Expected: FAIL — cannot resolve `../prepare/read-trip`.

- [ ] **Step 4: Write `prepare/types.ts`**

```ts
export interface MediaItem {
  src: string;
  type: 'photo' | 'video';
  thumb?: string;
  caption?: string;
  lat?: number;
  lng?: number;
  taken_at?: string;
}
export interface Stop {
  name: string;
  lat: number;
  lng: number;
  type?: string;
  label?: string;
  description?: string;
  media?: MediaItem[];
}
export interface Day {
  number: number;
  title: string;
  date: string;
  color?: string;
  stops: Stop[];
  lodging?: { name: string; lat?: number; lng?: number };
}
export interface Trip {
  trip: {
    title: string;
    subtitle?: string;
    dates?: string;
    origin?: string;
    origin_lat?: number;
    origin_lng?: number;
    destination_lat?: number;
    destination_lng?: number;
    travelers?: { adults?: number; children?: number };
    agent_context?: { iteration_log?: { date: string; change: string }[] };
  };
  days: Day[];
}
export interface NarrationEntry {
  day: number;
  stop_index: number;
  stop: string;
  script: string;
}
export interface FlatStop {
  day: number;
  stopIndex: number;
  dayColor: string;
  stop: Stop;
}

// Props consumed by the Remotion composition (output of the prepare stage).
export interface CaptionToken { text: string; fromMs: number; toMs: number; }
export interface SegmentProps {
  day: number;
  stopIndex: number;
  title: string;       // stop name
  dayTitle: string;
  date: string;
  dayColor: string;
  description: string;
  mapImage: string;            // relative path into assets/generated
  mapWidth: number;
  mapHeight: number;
  fromPx: { x: number; y: number } | null;   // previous stop pixel (camera start)
  toPx: { x: number; y: number };             // this stop pixel (camera end)
  routePx: { x: number; y: number }[];        // polyline in map-image pixels
  photos: string[];            // resolved photo srcs/urls
  narrationAudio: string | null;
  narrationSeconds: number | null;
  captions: CaptionToken[];
  durationInFrames: number;
}
export interface VideoProps {
  title: string;
  subtitle: string;
  fps: number;
  width: number;
  height: number;
  music: string | null;
  attribution: string;
  segments: SegmentProps[];
}
```

- [ ] **Step 5: Write `prepare/read-trip.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import type { Trip, NarrationEntry, FlatStop } from './types.js';

export function readTrip(path: string): Trip {
  const data = yaml.load(readFileSync(path, 'utf8')) as Trip;
  if (!data || !Array.isArray(data.days)) {
    throw new Error(`Not a valid trip file (no days[]): ${path}`);
  }
  return data;
}

export function readNarration(path: string): NarrationEntry[] {
  if (!existsSync(path)) return [];
  const data = yaml.load(readFileSync(path, 'utf8')) as { stops?: NarrationEntry[] } | NarrationEntry[];
  const list = Array.isArray(data) ? data : data?.stops ?? [];
  return list.filter((e) => Number.isInteger(e.day) && Number.isInteger(e.stop_index));
}

function isFinitePair(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

export function flattenStops(trip: Trip): FlatStop[] {
  const out: FlatStop[] = [];
  for (const day of trip.days || []) {
    (day.stops || []).forEach((stop, stopIndex) => {
      if (!isFinitePair(stop.lat, stop.lng)) return;
      out.push({ day: day.number, stopIndex, dayColor: day.color || '#666666', stop });
    });
  }
  return out;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd renderers/remotion && npx vitest run tests/read-trip.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add renderers/remotion/prepare/types.ts renderers/remotion/prepare/read-trip.ts renderers/remotion/tests/read-trip.test.ts renderers/remotion/tests/fixtures/mini-trip.yaml
git commit -m "feat(video): shared types + trip reader/flattener"
```

---

## Task 4: Tile-source adapter

**Files:**
- Create: `renderers/remotion/prepare/adapters/tiles.ts`
- Test: `renderers/remotion/tests/adapters.test.ts` (tiles section)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TileProvider { id: string; urlTemplate: string; attribution: string }`
  - `getTileProvider(id?: string, env?: NodeJS.ProcessEnv): TileProvider` — default `'maptiler'` (requires `MAPTILER_KEY`); `'esri'` fallback (no key, non-commercial). Throws an actionable error if MapTiler chosen with no key.

- [ ] **Step 1: Write the failing test**

`renderers/remotion/tests/adapters.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getTileProvider } from '../prepare/adapters/tiles';

describe('tile adapter', () => {
  it('defaults to maptiler and injects the key', () => {
    const p = getTileProvider(undefined, { MAPTILER_KEY: 'abc123' } as never);
    expect(p.id).toBe('maptiler');
    expect(p.urlTemplate).toContain('abc123');
    expect(p.urlTemplate).toMatch(/\{z\}.*\{x\}.*\{y\}/);
    expect(p.attribution).toMatch(/MapTiler/);
  });

  it('errors clearly when maptiler is selected without a key', () => {
    expect(() => getTileProvider('maptiler', {} as never)).toThrow(/MAPTILER_KEY/);
  });

  it('supports the esri non-commercial fallback without a key', () => {
    const p = getTileProvider('esri', {} as never);
    expect(p.id).toBe('esri');
    expect(p.urlTemplate).toContain('arcgisonline');
    expect(p.attribution).toMatch(/Esri/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd renderers/remotion && npx vitest run tests/adapters.test.ts`
Expected: FAIL — cannot resolve `../prepare/adapters/tiles`.

- [ ] **Step 3: Write the implementation**

`renderers/remotion/prepare/adapters/tiles.ts`:
```ts
export interface TileProvider {
  id: string;
  urlTemplate: string; // staticmaps-style with {z}/{x}/{y}
  attribution: string;
}

export function getTileProvider(id = 'maptiler', env: NodeJS.ProcessEnv = process.env): TileProvider {
  switch (id) {
    case 'maptiler': {
      const key = env.MAPTILER_KEY;
      if (!key) {
        throw new Error(
          'MapTiler is the default tile provider for video but MAPTILER_KEY is not set. ' +
          'Get a free key at https://maptiler.com, then `export MAPTILER_KEY=…`, ' +
          'or pass --tiles esri for non-commercial output.'
        );
      }
      return {
        id: 'maptiler',
        urlTemplate: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${key}`,
        attribution: '© MapTiler © OpenStreetMap contributors',
      };
    }
    case 'esri':
      return {
        id: 'esri',
        // NOTE: Esri public tiles are non-commercial only when baked into video. Attribution required.
        urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Esri, USGS (non-commercial use)',
      };
    default:
      throw new Error(`Unknown tile provider "${id}". Use "maptiler" or "esri".`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd renderers/remotion && npx vitest run tests/adapters.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add renderers/remotion/prepare/adapters/tiles.ts renderers/remotion/tests/adapters.test.ts
git commit -m "feat(video): pluggable tile-source adapter (MapTiler default, Esri fallback)"
```

---

## Task 5: Map stitching + segment geometry

**Files:**
- Create: `renderers/remotion/prepare/map-tiles.ts`
- Test: `renderers/remotion/tests/map-tiles.test.ts`

**Interfaces:**
- Consumes: `projection.ts`, `adapters/tiles.ts`, types.
- Produces:
  - `computeSegmentView(fromLatLng: {lat;lng} | null, toLatLng: {lat;lng}, opts): { zoom; origin: {x;y}; width; height }` — choose a zoom + bbox that frames the from/to points (with padding); pure, testable.
  - `async stitchMap(view, provider, outPath): Promise<void>` — render a static PNG via `staticmaps` (network; not unit-tested in CI — covered by the smoke test).
  - `projectRoute(points: {lat;lng}[], zoom, origin): {x;y}[]` — map waypoints to image pixels.

- [ ] **Step 1: Write the failing test (pure geometry only)**

`renderers/remotion/tests/map-tiles.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeSegmentView, projectRoute } from '../prepare/map-tiles';

describe('segment view geometry', () => {
  it('frames a single point centered (no from-point)', () => {
    const v = computeSegmentView(null, { lat: 37.7561, lng: -119.5966 }, { width: 1920, height: 1080 });
    expect(v.width).toBe(1920);
    expect(v.height).toBe(1080);
    expect(v.zoom).toBeGreaterThan(0);
    expect(v.zoom).toBeLessThanOrEqual(18);
  });

  it('chooses a lower zoom when the two points are far apart', () => {
    const near = computeSegmentView({ lat: 37.7561, lng: -119.5966 }, { lat: 37.7159, lng: -119.6770 }, { width: 1920, height: 1080 });
    const far = computeSegmentView({ lat: 37.7561, lng: -119.5966 }, { lat: 36.7378, lng: -119.7871 }, { width: 1920, height: 1080 });
    expect(far.zoom).toBeLessThan(near.zoom);
  });

  it('projects waypoints into image pixels within the frame', () => {
    const v = computeSegmentView(null, { lat: 37.7561, lng: -119.5966 }, { width: 1920, height: 1080 });
    const px = projectRoute([{ lat: 37.7561, lng: -119.5966 }], v.zoom, v.origin);
    expect(px).toHaveLength(1);
    expect(px[0].x).toBeGreaterThan(0);
    expect(px[0].x).toBeLessThan(1920);
    expect(px[0].y).toBeGreaterThan(0);
    expect(px[0].y).toBeLessThan(1080);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd renderers/remotion && npx vitest run tests/map-tiles.test.ts`
Expected: FAIL — cannot resolve `../prepare/map-tiles`.

- [ ] **Step 3: Write the implementation**

`renderers/remotion/prepare/map-tiles.ts`:
```ts
import StaticMaps from 'staticmaps';
import { latLngToWorld, worldSize, MAX_LAT } from './projection.js';
import type { TileProvider } from './adapters/tiles.js';

export interface SegmentView {
  zoom: number;
  origin: { x: number; y: number };
  width: number;
  height: number;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 16;

// Pick the highest zoom at which both points (plus padding) fit in width×height.
export function computeSegmentView(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number },
  opts: { width: number; height: number; padding?: number }
): SegmentView {
  const pad = opts.padding ?? 0.35; // fraction of frame kept as margin
  const pts = from ? [from, to] : [to];
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
    const worlds = pts.map((p) => latLngToWorld(p.lat, p.lng, zoom));
    const minX = Math.min(...worlds.map((w) => w.x));
    const maxX = Math.max(...worlds.map((w) => w.x));
    const minY = Math.min(...worlds.map((w) => w.y));
    const maxY = Math.max(...worlds.map((w) => w.y));
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (spanX <= opts.width * (1 - pad) && spanY <= opts.height * (1 - pad)) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return {
        zoom,
        origin: { x: cx - opts.width / 2, y: cy - opts.height / 2 },
        width: opts.width,
        height: opts.height,
      };
    }
  }
  // Fall back to MIN_ZOOM centered on `to`.
  const w = latLngToWorld(to.lat, to.lng, MIN_ZOOM);
  return {
    zoom: MIN_ZOOM,
    origin: { x: w.x - opts.width / 2, y: w.y - opts.height / 2 },
    width: opts.width,
    height: opts.height,
  };
}

export function projectRoute(
  points: { lat: number; lng: number }[],
  zoom: number,
  origin: { x: number; y: number }
): { x: number; y: number }[] {
  return points.map((p) => {
    const w = latLngToWorld(p.lat, p.lng, zoom);
    return { x: w.x - origin.x, y: w.y - origin.y };
  });
}

// Center lat/lng of a view, for staticmaps which centers by lat/lng+zoom.
function viewCenterLatLng(view: SegmentView): { lat: number; lng: number } {
  const size = worldSize(view.zoom);
  const cx = view.origin.x + view.width / 2;
  const cy = view.origin.y + view.height / 2;
  const lng = (cx / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * cy) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)), lng };
}

export async function stitchMap(view: SegmentView, provider: TileProvider, outPath: string): Promise<void> {
  const map = new StaticMaps({
    width: view.width,
    height: view.height,
    tileUrl: provider.urlTemplate,
    tileSize: 256,
  });
  const center = viewCenterLatLng(view);
  await map.render([center.lng, center.lat], view.zoom);
  await map.image.save(outPath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd renderers/remotion && npx vitest run tests/map-tiles.test.ts`
Expected: PASS (3 tests). (`stitchMap` is not exercised here — it hits the network and is covered by the smoke test in Task 12.)

- [ ] **Step 5: Commit**

```bash
git add renderers/remotion/prepare/map-tiles.ts renderers/remotion/tests/map-tiles.test.ts
git commit -m "feat(video): segment view geometry + static map stitching"
```

---

## Task 6: TTS + music adapters

**Files:**
- Create: `renderers/remotion/prepare/adapters/tts.ts`
- Create: `renderers/remotion/prepare/adapters/music.ts`
- Create: `renderers/remotion/assets/music/default.mp3` (placeholder; see step)
- Test: extend `renderers/remotion/tests/adapters.test.ts`

**Interfaces:**
- Consumes: nothing (default impls call provider APIs behind env keys; a stub impl is injectable).
- Produces:
  - `interface TtsAdapter { synthesize(text: string, outPath: string): Promise<number> }` — returns audio duration in seconds.
  - `getTtsAdapter(env?): TtsAdapter` — default impl behind `TRIPKIT_TTS_KEY`; throws an actionable error if narration requested without a key.
  - `resolveMusic(opt: string | undefined, env, outDir): Promise<string | null>` — `undefined`→bundled default; a file path→that file; `'ai'`→music adapter (behind key) ; returns final path or `null`.

- [ ] **Step 1: Add the failing tests to `tests/adapters.test.ts`**

Append:
```ts
import { getTtsAdapter } from '../prepare/adapters/tts';
import { resolveMusic } from '../prepare/adapters/music';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('tts adapter', () => {
  it('throws an actionable error when no TTS key is set', () => {
    expect(() => getTtsAdapter({} as never)).toThrow(/TRIPKIT_TTS_KEY/);
  });
});

describe('music resolver', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  it('falls back to the bundled default track when no option given', async () => {
    const p = await resolveMusic(undefined, {} as never, '/tmp');
    expect(p).not.toBeNull();
    expect(existsSync(p as string)).toBe(true);
  });

  it('returns a user-supplied file path as-is', async () => {
    const supplied = join(here, 'fixtures', 'mini-trip.yaml'); // any existing file
    const p = await resolveMusic(supplied, {} as never, '/tmp');
    expect(p).toBe(supplied);
  });

  it('errors on --music ai without a key', async () => {
    await expect(resolveMusic('ai', {} as never, '/tmp')).rejects.toThrow(/TRIPKIT_MUSIC_KEY/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd renderers/remotion && npx vitest run tests/adapters.test.ts`
Expected: FAIL — cannot resolve tts/music modules.

- [ ] **Step 3: Create a placeholder default music file**

Run:
```bash
cd renderers/remotion && mkdir -p assets/music && printf 'PLACEHOLDER-REPLACE-WITH-ROYALTY-FREE-TRACK' > assets/music/default.mp3
```
(The real royalty-free MP3 is sourced before release; the file's existence is what the resolver and tests depend on. Note it in the README "before publishing" checklist.)

- [ ] **Step 4: Write `prepare/adapters/tts.ts`**

```ts
export interface TtsAdapter {
  synthesize(text: string, outPath: string): Promise<number>; // seconds
}

// Default adapter is a thin HTTP client behind an env key. The actual provider
// request is intentionally isolated here so it can be swapped or stubbed.
export function getTtsAdapter(env: NodeJS.ProcessEnv = process.env): TtsAdapter {
  const key = env.TRIPKIT_TTS_KEY;
  if (!key) {
    throw new Error(
      'Narration requested (--narrate) but TRIPKIT_TTS_KEY is not set. ' +
      'Set a TTS provider key, or omit --narrate to render with captions + music only.'
    );
  }
  return {
    async synthesize(text: string, outPath: string): Promise<number> {
      // Provider-specific HTTP call writes an audio file to outPath, then we
      // measure its duration. Implemented against the chosen default provider.
      const { synthesizeWithProvider } = await import('./tts-provider.js');
      return synthesizeWithProvider(text, outPath, key);
    },
  };
}
```

Also create `renderers/remotion/prepare/adapters/tts-provider.ts` (the swappable provider call — kept separate so the interface stays clean):
```ts
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { writeFile } from 'node:fs/promises';

// Default provider implementation. Replace the fetch body to target a different
// TTS service; the contract is: write audio to outPath, return its duration (s).
export async function synthesizeWithProvider(text: string, outPath: string, apiKey: string): Promise<number> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`TTS provider error ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return getAudioDurationInSeconds(outPath);
}
```

- [ ] **Step 5: Write `prepare/adapters/music.ts`**

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRACK = join(here, '..', '..', 'assets', 'music', 'default.mp3');

export async function resolveMusic(
  opt: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  outDir = '/tmp'
): Promise<string | null> {
  if (opt === undefined) {
    return existsSync(DEFAULT_TRACK) ? DEFAULT_TRACK : null;
  }
  if (opt === 'ai') {
    const key = env.TRIPKIT_MUSIC_KEY;
    if (!key) {
      throw new Error('--music ai requires TRIPKIT_MUSIC_KEY. Supply a music file path instead, or omit --music for the bundled track.');
    }
    const { generateMusic } = await import('./music-provider.js');
    return generateMusic(key, join(outDir, 'music.mp3'));
  }
  // Treat as a file path.
  if (!existsSync(opt)) throw new Error(`Music file not found: ${opt}`);
  return opt;
}
```

Also create `renderers/remotion/prepare/adapters/music-provider.ts`:
```ts
import { writeFile } from 'node:fs/promises';

// Default AI-music provider. Swap the fetch body to target a different service.
export async function generateMusic(apiKey: string, outPath: string): Promise<string> {
  const res = await fetch('https://api.example-music.test/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'gentle uplifting acoustic travel background, instrumental', durationSeconds: 90 }),
  });
  if (!res.ok) throw new Error(`Music provider error ${res.status}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd renderers/remotion && npx vitest run tests/adapters.test.ts`
Expected: PASS (tiles 3 + tts 1 + music 3 = 7 tests).

- [ ] **Step 7: Commit**

```bash
git add renderers/remotion/prepare/adapters/ renderers/remotion/assets/music/default.mp3 renderers/remotion/tests/adapters.test.ts
git commit -m "feat(video): pluggable TTS + music adapters with graceful key errors"
```

---

## Task 7: Narration scaffold

**Files:**
- Create: `renderers/remotion/prepare/narration-scaffold.ts`
- Test: `renderers/remotion/tests/narration-scaffold.test.ts`

**Interfaces:**
- Consumes: `read-trip.ts` (`flattenStops`), types.
- Produces: `buildNarrationScaffold(trip: Trip): { _instructions: string[]; voice: string; stops: NarrationEntry[] }` — one entry per flattened stop, `script` pre-filled from description + captions.

- [ ] **Step 1: Write the failing test**

`renderers/remotion/tests/narration-scaffold.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTrip } from '../prepare/read-trip';
import { buildNarrationScaffold } from '../prepare/narration-scaffold';

const here = dirname(fileURLToPath(import.meta.url));
const trip = readTrip(join(here, 'fixtures', 'mini-trip.yaml'));

describe('narration scaffold', () => {
  it('emits one entry per stop with day/stop_index/name', () => {
    const s = buildNarrationScaffold(trip);
    expect(s.stops).toHaveLength(3);
    expect(s.stops[0]).toMatchObject({ day: 1, stop_index: 0, stop: 'Lower Yosemite Fall' });
  });

  it('pre-fills script from the stop description', () => {
    const s = buildNarrationScaffold(trip);
    expect(s.stops[0].script).toContain('lower fall');
  });

  it('declares the first-person-plural voice for the agent', () => {
    const s = buildNarrationScaffold(trip);
    expect(s.voice).toMatch(/first-person plural/i);
    expect(s._instructions.join(' ')).toMatch(/we|our/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd renderers/remotion && npx vitest run tests/narration-scaffold.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

`renderers/remotion/prepare/narration-scaffold.ts`:
```ts
import { flattenStops } from './read-trip.js';
import type { Trip, NarrationEntry } from './types.js';

export function buildNarrationScaffold(trip: Trip): {
  _instructions: string[];
  voice: string;
  stops: NarrationEntry[];
} {
  const stops: NarrationEntry[] = flattenStops(trip).map(({ day, stopIndex, stop }) => {
    const captionBits = (stop.media || []).map((m) => m.caption).filter(Boolean).join('. ');
    const seed = [stop.description, captionBits].filter(Boolean).join(' ');
    return { day, stop_index: stopIndex, stop: stop.name, script: seed };
  });
  return {
    _instructions: [
      'Rewrite each `script` as first-person-plural ("we/our") travel narration — as if recalling the trip.',
      'Ground it in the real stop, its photo captions, and the trip itinerary. ~1 sentence per few seconds.',
      'Then render: npm run video -- <trip.yaml> out.mp4 --narrate',
    ],
    voice: 'first-person plural (we/our)',
    stops,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd renderers/remotion && npx vitest run tests/narration-scaffold.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add renderers/remotion/prepare/narration-scaffold.ts renderers/remotion/tests/narration-scaffold.test.ts
git commit -m "feat(video): narration scaffold generator (first-person-plural)"
```

---

## Task 8: Caption transcription (optional/graceful)

**Files:**
- Create: `renderers/remotion/prepare/captions.ts`
- Test: `renderers/remotion/tests/captions.test.ts`

**Interfaces:**
- Consumes: types (`CaptionToken`).
- Produces:
  - `async transcribeToTokens(audioPath: string, opts?): Promise<CaptionToken[]>` — uses `@remotion/install-whisper-cpp` + `@remotion/captions`; returns `[]` (with a console notice) if whisper isn't available. Network/binary, not exercised in CI.
  - `splitCaptionsBySilence(...)` — pure helper that is unit-tested: `tokensForText(text: string, totalSeconds: number): CaptionToken[]` — a deterministic fallback that distributes words evenly across the narration duration when whisper is unavailable.

- [ ] **Step 1: Write the failing test (pure fallback only)**

`renderers/remotion/tests/captions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tokensForText } from '../prepare/captions';

describe('caption fallback', () => {
  it('distributes words across the duration', () => {
    const toks = tokensForText('we hiked to the falls', 5);
    expect(toks).toHaveLength(5);
    expect(toks[0].fromMs).toBe(0);
    expect(toks[4].toMs).toBeCloseTo(5000, 0);
    // monotonically increasing
    for (let i = 1; i < toks.length; i++) expect(toks[i].fromMs).toBeGreaterThanOrEqual(toks[i - 1].fromMs);
  });

  it('returns [] for empty text', () => {
    expect(tokensForText('', 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd renderers/remotion && npx vitest run tests/captions.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

`renderers/remotion/prepare/captions.ts`:
```ts
import type { CaptionToken } from './types.js';

// Deterministic even-split fallback (used when whisper is unavailable).
export function tokensForText(text: string, totalSeconds: number): CaptionToken[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const per = (totalSeconds * 1000) / words.length;
  return words.map((w, i) => ({ text: w, fromMs: Math.round(i * per), toMs: Math.round((i + 1) * per) }));
}

// Whisper-backed transcription. Optional: if the binary/model can't be set up,
// log a notice and return [] so the caller can fall back to tokensForText.
export async function transcribeToTokens(audioPath: string): Promise<CaptionToken[]> {
  try {
    const { installWhisperCpp, downloadWhisperModel, transcribe, toCaptions } = await import('@remotion/install-whisper-cpp');
    const to = '/tmp/whisper.cpp';
    await installWhisperCpp({ to, version: '1.5.5' });
    await downloadWhisperModel({ model: 'medium.en', folder: to });
    const { transcription } = await transcribe({
      inputPath: audioPath,
      whisperPath: to,
      model: 'medium.en',
      tokenLevelTimestamps: true,
    });
    const { captions } = toCaptions({ whisperCppOutput: transcription });
    return captions.map((c) => ({ text: c.text, fromMs: c.startMs, toMs: c.endMs }));
  } catch (err) {
    console.warn(`  ⚠ whisper unavailable — falling back to even-split captions. (${(err as Error).message})`);
    return [];
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd renderers/remotion && npx vitest run tests/captions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add renderers/remotion/prepare/captions.ts renderers/remotion/tests/captions.test.ts
git commit -m "feat(video): caption transcription with deterministic even-split fallback"
```

---

## Task 9: Build video props

**Files:**
- Create: `renderers/remotion/prepare/build-props.ts`
- Test: `renderers/remotion/tests/build-props.test.ts`

**Interfaces:**
- Consumes: all prepare modules + types.
- Produces: `async buildProps(opts: { trip: Trip; narration: NarrationEntry[]; provider: TileProvider; tts: TtsAdapter | null; music: string | null; assetsDir: string; fps?: number }): Promise<VideoProps>` — orchestrates per-segment: view geometry, map stitch, route projection, narration audio + duration, captions, and computes `durationInFrames`. The map-stitch + tts calls are injected so the test can stub them.

To keep `buildProps` testable without network, it takes `deps` for the side-effecting calls:
- `deps.stitch(view, provider, outPath): Promise<void>`
- `deps.synth(text, outPath): Promise<number>` (narration seconds) — or `null` when not narrating.
- `deps.captionsFor(audioPath, seconds, text): Promise<CaptionToken[]>`

- [ ] **Step 1: Write the failing test (with stubbed deps)**

`renderers/remotion/tests/build-props.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTrip } from '../prepare/read-trip';
import { buildProps } from '../prepare/build-props';
import { tokensForText } from '../prepare/captions';

const here = dirname(fileURLToPath(import.meta.url));
const trip = readTrip(join(here, 'fixtures', 'mini-trip.yaml'));
const provider = { id: 'esri', urlTemplate: 'x', attribution: 'Esri' };

const noNarration = {
  stitch: async () => {},
  synth: null,
  captionsFor: async (_a: string, s: number, t: string) => tokensForText(t, s),
};

describe('buildProps', () => {
  it('creates one segment per stop with positive frame durations', async () => {
    const props = await buildProps({
      trip, narration: [], provider, tts: null, music: null, assetsDir: '/tmp/a', fps: 30,
    }, noNarration);
    expect(props.segments).toHaveLength(3);
    for (const seg of props.segments) {
      expect(seg.durationInFrames).toBeGreaterThan(0);
      expect(seg.mapWidth).toBe(1920);
      expect(seg.toPx).toBeTruthy();
    }
    expect(props.fps).toBe(30);
    expect(props.attribution).toMatch(/Esri/);
  });

  it('sets fromPx null on the first segment and non-null after', async () => {
    const props = await buildProps({
      trip, narration: [], provider, tts: null, music: null, assetsDir: '/tmp/a', fps: 30,
    }, noNarration);
    expect(props.segments[0].fromPx).toBeNull();
    expect(props.segments[1].fromPx).not.toBeNull();
  });

  it('syncs a narrated segment duration to the narration length', async () => {
    const narration = [{ day: 1, stop_index: 0, stop: 'Lower Yosemite Fall', script: 'we hiked to the roaring falls today' }];
    const deps = {
      stitch: async () => {},
      synth: async () => 8, // 8 seconds of narration
      captionsFor: async (_a: string, s: number, t: string) => tokensForText(t, s),
    };
    const props = await buildProps({
      trip, narration, provider, tts: { synthesize: async () => 8 }, music: null, assetsDir: '/tmp/a', fps: 30,
    }, deps);
    const seg0 = props.segments[0];
    expect(seg0.narrationSeconds).toBe(8);
    // duration at least covers the narration (8s * 30fps = 240 frames)
    expect(seg0.durationInFrames).toBeGreaterThanOrEqual(240);
    expect(seg0.captions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd renderers/remotion && npx vitest run tests/build-props.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

`renderers/remotion/prepare/build-props.ts`:
```ts
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { flattenStops } from './read-trip.js';
import { computeSegmentView, projectRoute } from './map-tiles.js';
import type { Trip, NarrationEntry, VideoProps, SegmentProps, CaptionToken } from './types.js';
import type { TileProvider } from './adapters/tiles.js';
import type { TtsAdapter } from './adapters/tts.js';

const W = 1920, H = 1080;
const BASE_SECONDS_PER_STOP = 5;       // when no narration
const MIN_SECONDS_PER_STOP = 4;

export interface BuildDeps {
  stitch: (view: { zoom: number; origin: { x: number; y: number }; width: number; height: number }, provider: TileProvider, outPath: string) => Promise<void>;
  synth: ((text: string, outPath: string) => Promise<number>) | null;
  captionsFor: (audioPath: string, seconds: number, text: string) => Promise<CaptionToken[]>;
}

export async function buildProps(
  opts: { trip: Trip; narration: NarrationEntry[]; provider: TileProvider; tts: TtsAdapter | null; music: string | null; assetsDir: string; fps?: number },
  deps: BuildDeps
): Promise<VideoProps> {
  const fps = opts.fps ?? 30;
  mkdirSync(opts.assetsDir, { recursive: true });
  const flat = flattenStops(opts.trip);
  const origin = (Number.isFinite(opts.trip.trip.origin_lat) && Number.isFinite(opts.trip.trip.origin_lng))
    ? { lat: opts.trip.trip.origin_lat!, lng: opts.trip.trip.origin_lng! }
    : null;

  const narrationByStop = new Map(opts.narration.map((n) => [`${n.day}:${n.stop_index}`, n.script]));
  const segments: SegmentProps[] = [];

  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i];
    const prevLatLng = i === 0 ? origin : { lat: flat[i - 1].stop.lat, lng: flat[i - 1].stop.lng };
    const toLatLng = { lat: cur.stop.lat, lng: cur.stop.lng };
    const view = computeSegmentView(prevLatLng, toLatLng, { width: W, height: H });

    const mapImage = join(opts.assetsDir, `map-${i}.png`);
    await deps.stitch(view, opts.provider, mapImage);

    const routeLatLng = prevLatLng ? [prevLatLng, toLatLng] : [toLatLng];
    const routePx = projectRoute(routeLatLng, view.zoom, view.origin);
    const toPx = projectRoute([toLatLng], view.zoom, view.origin)[0];
    const fromPx = prevLatLng ? projectRoute([prevLatLng], view.zoom, view.origin)[0] : null;

    const dayMeta = opts.trip.days.find((d) => d.number === cur.day);
    const script = narrationByStop.get(`${cur.day}:${cur.stopIndex}`) || '';

    let narrationAudio: string | null = null;
    let narrationSeconds: number | null = null;
    let captions: CaptionToken[] = [];
    if (opts.tts && deps.synth && script) {
      narrationAudio = join(opts.assetsDir, `narration-${i}.mp3`);
      narrationSeconds = await deps.synth(script, narrationAudio);
      captions = await deps.captionsFor(narrationAudio, narrationSeconds, script);
    }

    const seconds = Math.max(MIN_SECONDS_PER_STOP, narrationSeconds ?? BASE_SECONDS_PER_STOP);
    const durationInFrames = Math.ceil(seconds * fps);

    segments.push({
      day: cur.day,
      stopIndex: cur.stopIndex,
      title: cur.stop.name,
      dayTitle: dayMeta?.title ?? '',
      date: dayMeta?.date ?? '',
      dayColor: cur.dayColor,
      description: cur.stop.description ?? '',
      mapImage: `map-${i}.png`,
      mapWidth: view.width,
      mapHeight: view.height,
      fromPx,
      toPx,
      routePx,
      photos: (cur.stop.media || []).filter((m) => m.type === 'photo').map((m) => m.src),
      narrationAudio: narrationAudio ? `narration-${i}.mp3` : null,
      narrationSeconds,
      captions,
      durationInFrames,
    });
  }

  return {
    title: opts.trip.trip.title,
    subtitle: opts.trip.trip.subtitle ?? '',
    fps, width: W, height: H,
    music: opts.music,
    attribution: opts.provider.attribution,
    segments,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd renderers/remotion && npx vitest run tests/build-props.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole prepare suite**

Run: `cd renderers/remotion && npx vitest run`
Expected: PASS (projection 5 + read-trip 3 + tiles/tts/music 7 + map-tiles 3 + narration 3 + captions 2 + build-props 3 = 26).

- [ ] **Step 6: Commit**

```bash
git add renderers/remotion/prepare/build-props.ts renderers/remotion/tests/build-props.test.ts
git commit -m "feat(video): assemble video-props.json (durations, segments, narration sync)"
```

---

## Task 10: Remotion composition — visuals

**Files:**
- Create: `renderers/remotion/src/index.ts`
- Create: `renderers/remotion/src/Root.tsx`
- Create: `renderers/remotion/src/Trip.tsx`
- Create: `renderers/remotion/src/components/MapFly.tsx`
- Create: `renderers/remotion/src/components/PhotoMontage.tsx`
- Create: `renderers/remotion/src/components/TitleCard.tsx`
- Create: `renderers/remotion/src/components/Subtitles.tsx`
- Create: `renderers/remotion/remotion.config.ts`

**Interfaces:**
- Consumes: `VideoProps`, `SegmentProps` from `prepare/types.ts`.
- Produces: a registered Remotion composition `"Trip"` whose `defaultProps` shape is `VideoProps`, renderable via the CLI and the renderer Node API.

- [ ] **Step 1: Write `remotion.config.ts`**

```ts
import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setConcurrency(1);
```

- [ ] **Step 2: Write `src/components/MapFly.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { interpolateZoom } from 'd3-interpolate';
import { evolvePath, getPointAtLength, getTangentAtLength } from '@remotion/paths';
import type { SegmentProps } from '../../prepare/types.js';

export const MapFly: React.FC<{ seg: SegmentProps; assetBase: string }> = ({ seg, assetBase }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();

  const start = seg.fromPx ?? seg.toPx;
  const view0: [number, number, number] = [start.x, start.y, width];
  const view1: [number, number, number] = [seg.toPx.x, seg.toPx.y, width * 0.6];
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const [cx, cy, w] = interpolateZoom(view0, view1)(t);
  const scale = width / w;
  const tx = width / 2 - cx * scale;
  const ty = height / 2 - cy * scale;

  const d = seg.routePx.length >= 2
    ? `M ${seg.routePx.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    : '';
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const evolved = d ? evolvePath(progress, d) : null;
  const marker = d && evolved ? getPointAtLength((evolved as { strokeDasharray: string }), 0) : null; // placeholder; see note

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      <div style={{ position: 'absolute', transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <Img src={seg.mapImage.startsWith('http') ? seg.mapImage : staticFile(`${assetBase}/${seg.mapImage}`)} style={{ width: seg.mapWidth, height: seg.mapHeight }} />
        {d && evolved ? (
          <svg width={seg.mapWidth} height={seg.mapHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
            <path d={d} fill="none" stroke="#fff" strokeWidth={6 / scale} opacity={0.5} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
            <path d={d} fill="none" stroke={seg.dayColor} strokeWidth={3 / scale} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
          </svg>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
```

> NOTE for the implementer: `getPointAtLength`/`getTangentAtLength` take a path `d` string + a length, not the evolved object. If you add a marker dot riding the line tip, compute `const len = getLength(d) * progress; const pt = getPointAtLength(d, len);` and render a `<circle>` at `pt`. Keep it optional — the route reveal is the required effect. Remove the unused `marker`/`getTangentAtLength` import if you don't add the dot, so the build stays clean.

- [ ] **Step 3: Write `src/components/PhotoMontage.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';

export const PhotoMontage: React.FC<{ photos: string[]; assetBase: string }> = ({ photos, assetBase }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (photos.length === 0) return null;
  const per = durationInFrames / photos.length;
  const idx = Math.min(photos.length - 1, Math.floor(frame / per));
  const local = frame - idx * per;
  const scale = interpolate(local, [0, per], [1.05, 1.18], { extrapolateRight: 'clamp' });
  const opacity = interpolate(local, [0, per * 0.15, per * 0.85, per], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const src = photos[idx];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '78%', height: '70%', overflow: 'hidden', borderRadius: 14, boxShadow: '0 20px 80px rgba(0,0,0,.6)', opacity }}>
        <Img src={src.startsWith('http') ? src : staticFile(`${assetBase}/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }} />
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Write `src/components/TitleCard.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SegmentProps } from '../../prepare/types.js';

export const TitleCard: React.FC<{ seg: SegmentProps }> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const opacity = Math.min(enter, exit);
  const y = interpolate(enter, [0, 1], [20, 0]);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 80, pointerEvents: 'none' }}>
      <div style={{ transform: `translateY(${y}px)`, opacity }}>
        <div style={{ display: 'inline-block', background: seg.dayColor, color: '#fff', fontSize: 22, fontWeight: 600, padding: '6px 14px', borderRadius: 20, fontFamily: 'sans-serif' }}>
          Day {seg.day} · {seg.date}
        </div>
        <div style={{ color: '#fff', fontSize: 64, fontWeight: 700, marginTop: 12, fontFamily: 'serif', textShadow: '0 2px 20px rgba(0,0,0,.8)' }}>{seg.title}</div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 5: Write `src/components/Subtitles.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionToken } from '../../prepare/types.js';

export const Subtitles: React.FC<{ captions: CaptionToken[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (captions.length === 0) return null;
  const ms = (frame / fps) * 1000;
  // Show a ~3s window of words around the current time.
  const windowMs = 2600;
  const visible = captions.filter((c) => c.toMs >= ms - 200 && c.fromMs <= ms + windowMs);
  if (visible.length === 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56 }}>
      <div style={{ maxWidth: '80%', textAlign: 'center', fontFamily: 'sans-serif', fontSize: 34, lineHeight: 1.35 }}>
        {visible.map((c, i) => {
          const active = ms >= c.fromMs && ms <= c.toMs;
          return (
            <span key={i} style={{ color: active ? '#fff' : 'rgba(255,255,255,.7)', background: 'rgba(0,0,0,.45)', padding: '2px 6px', borderRadius: 4, margin: '0 2px', fontWeight: active ? 700 : 500 }}>
              {c.text}{' '}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 6: Write `src/Trip.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Audio } from '@remotion/media';
import type { VideoProps } from '../prepare/types.js';
import { MapFly } from './components/MapFly.js';
import { PhotoMontage } from './components/PhotoMontage.js';
import { TitleCard } from './components/TitleCard.js';
import { Subtitles } from './components/Subtitles.js';

const ASSET_BASE = 'generated';

export const Trip: React.FC<VideoProps> = (props) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {props.music ? <Audio src={props.music.startsWith('http') ? props.music : require('remotion').staticFile(props.music)} volume={(f) => 0.25} /> : null}
      {props.segments.map((seg, i) => {
        const start = from;
        from += seg.durationInFrames;
        return (
          <Sequence key={i} from={start} durationInFrames={seg.durationInFrames}>
            <MapFly seg={seg} assetBase={ASSET_BASE} />
            <PhotoMontage photos={seg.photos} assetBase={ASSET_BASE} />
            <TitleCard seg={seg} />
            <Subtitles captions={seg.captions} />
            {seg.narrationAudio ? <Audio src={require('remotion').staticFile(`${ASSET_BASE}/${seg.narrationAudio}`)} /> : null}
          </Sequence>
        );
      })}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-end', padding: 10, pointerEvents: 'none' }}>
        <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 16, fontFamily: 'sans-serif', textShadow: '0 1px 3px #000' }}>{props.attribution}</span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

> NOTE: prefer top-level `import { Audio, staticFile } from ...` over `require(...)`; the inline `require` is shown only to keep each snippet standalone. Consolidate imports when assembling the file.

- [ ] **Step 7: Write `src/Root.tsx`**

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { Trip } from './Trip.js';
import type { VideoProps } from '../prepare/types.js';

const EMPTY: VideoProps = {
  title: '', subtitle: '', fps: 30, width: 1920, height: 1080, music: null, attribution: '', segments: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Trip"
    component={Trip}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={EMPTY}
    calculateMetadata={({ props }) => {
      const total = props.segments.reduce((sum, s) => sum + s.durationInFrames, 0);
      return { durationInFrames: Math.max(1, total), fps: props.fps, width: props.width, height: props.height };
    }}
  />
);
```

- [ ] **Step 8: Write `src/index.ts`**

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root.js';
registerRoot(RemotionRoot);
```

- [ ] **Step 9: Type-check the Remotion side**

Run: `cd renderers/remotion && npx tsc --noEmit`
Expected: no type errors. (Fix import consolidation / unused imports flagged by the NOTEs above until clean.)

- [ ] **Step 10: Commit**

```bash
git add renderers/remotion/src renderers/remotion/remotion.config.ts
git commit -m "feat(video): Remotion composition — map fly, route draw, montage, titles, subtitles"
```

---

## Task 11: `narrate` CLI

**Files:**
- Create: `renderers/remotion/scripts/narrate.ts`

**Interfaces:**
- Consumes: `read-trip.ts`, `narration-scaffold.ts`.
- Produces: a CLI that writes `<trip>.narration.yaml`.

- [ ] **Step 1: Write `scripts/narrate.ts`**

```ts
import { writeFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { readTrip } from '../prepare/read-trip.js';
import { buildNarrationScaffold } from '../prepare/narration-scaffold.js';

const tripPath = process.argv[2];
if (!tripPath) {
  console.error('Usage: npm run narrate -- <trip.yaml>');
  process.exit(1);
}
const trip = readTrip(tripPath);
const scaffold = buildNarrationScaffold(trip);
const outPath = tripPath.replace(/\.ya?ml$/i, '') + '.narration.yaml';
writeFileSync(outPath, yaml.dump(scaffold, { lineWidth: 100 }), 'utf8');
console.log(`✓ Wrote ${outPath} (${scaffold.stops.length} stops).`);
console.log('  Rewrite each `script` as first-person-plural narration, then render with --narrate.');
```

- [ ] **Step 2: Run it against the fixture**

Run: `cd renderers/remotion && npx tsx scripts/narrate.ts tests/fixtures/mini-trip.yaml && cat tests/fixtures/mini-trip.narration.yaml`
Expected: a `mini-trip.narration.yaml` is written with 3 stops, a `voice: first-person plural (we/our)` line, and `script` text from the descriptions.

- [ ] **Step 3: Clean up the generated fixture artifact**

Run: `cd renderers/remotion && rm tests/fixtures/mini-trip.narration.yaml`

- [ ] **Step 4: Commit**

```bash
git add renderers/remotion/scripts/narrate.ts
git commit -m "feat(video): narrate CLI — scaffold trip.narration.yaml"
```

---

## Task 12: `video` CLI + end-to-end smoke render

**Files:**
- Create: `renderers/remotion/scripts/video.ts`
- Test: `renderers/remotion/tests/smoke.test.ts`

**Interfaces:**
- Consumes: every prepare module + the Remotion bundle.
- Produces: `npm run video -- <trip.yaml> <out.mp4> [--narrate] [--music <file|ai>] [--tiles <provider>]`.

- [ ] **Step 1: Write `scripts/video.ts`**

```ts
import { writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { readTrip, readNarration } from '../prepare/read-trip.js';
import { getTileProvider } from '../prepare/adapters/tiles.js';
import { getTtsAdapter } from '../prepare/adapters/tts.js';
import { resolveMusic } from '../prepare/adapters/music.js';
import { stitchMap } from '../prepare/map-tiles.js';
import { buildProps } from '../prepare/build-props.js';
import { transcribeToTokens, tokensForText } from '../prepare/captions.js';

const here = dirname(fileURLToPath(import.meta.url));

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean { return process.argv.includes(`--${name}`); }

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--') && process.argv[process.argv.indexOf(a) - 1]?.startsWith('--') !== true);
  const tripPath = process.argv[2];
  const outPath = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'out.mp4';
  if (!tripPath) { console.error('Usage: npm run video -- <trip.yaml> <out.mp4> [--narrate] [--music <file|ai>] [--tiles <provider>]'); process.exit(1); }

  const narrate = has('narrate');
  const provider = getTileProvider(flag('tiles'));
  const tts = narrate ? getTtsAdapter() : null;
  const assetsDir = resolve(here, '..', 'assets', 'generated');
  mkdirSync(assetsDir, { recursive: true });
  const music = await resolveMusic(flag('music'), process.env, assetsDir);

  const trip = readTrip(tripPath);
  const narration = narrate ? readNarration(tripPath.replace(/\.ya?ml$/i, '') + '.narration.yaml') : [];

  console.log('Preparing assets (maps' + (narrate ? ', narration, captions' : '') + ')…');
  const props = await buildProps(
    { trip, narration, provider, tts, music, assetsDir, fps: 30 },
    {
      stitch: stitchMap,
      synth: tts ? (text, out) => tts.synthesize(text, out) : null,
      captionsFor: async (audioPath, seconds, text) => {
        const toks = await transcribeToTokens(audioPath);
        return toks.length ? toks : tokensForText(text, seconds);
      },
    }
  );

  // Copy resolved music into the served assets dir so staticFile() can reach it.
  let musicForProps = props.music;
  if (props.music && existsSync(props.music)) {
    const dest = join(assetsDir, 'music.mp3');
    cpSync(props.music, dest);
    musicForProps = 'generated/music.mp3';
  }
  const finalProps = { ...props, music: musicForProps };
  writeFileSync(join(assetsDir, 'video-props.json'), JSON.stringify(finalProps, null, 2));

  console.log('Bundling composition…');
  const serveUrl = await bundle({ entryPoint: resolve(here, '..', 'src', 'index.ts') });
  const composition = await selectComposition({ serveUrl, id: 'Trip', inputProps: finalProps });

  console.log(`Rendering ${composition.durationInFrames} frames → ${outPath}`);
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: outPath, inputProps: finalProps,
    onProgress: ({ progress }) => process.stdout.write(`\r  ${Math.round(progress * 100)}%`),
  });
  console.log(`\n✓ ${outPath}`);
}
main().catch((e) => { console.error('\n✖ ' + e.message); process.exit(1); });
```

> NOTE: Remotion serves files from a `public/` folder via `staticFile()`. The implementer must ensure the assets dir is reachable as `generated/…` from `staticFile()` — either set `--public-dir` / `staticBase`, place `assets/generated` under a `public/` dir, or symlink. Verify during the smoke test and adjust the `ASSET_BASE` / paths so `staticFile('generated/map-0.png')` resolves. This is the one integration detail to nail down at render time.

- [ ] **Step 2: Write the smoke test (single still, esri tiles, no key)**

`renderers/remotion/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readTrip } from '../prepare/read-trip';
import { getTileProvider } from '../prepare/adapters/tiles';
import { buildProps } from '../prepare/build-props';
import { tokensForText } from '../prepare/captions';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const here = dirname(fileURLToPath(import.meta.url));

describe('render smoke (mounts + single still)', () => {
  it('bundles, selects the Trip composition, and renders one frame', async () => {
    const trip = readTrip(join(here, 'fixtures', 'mini-trip.yaml'));
    const provider = getTileProvider('esri', {} as never); // no key needed
    const assetsDir = mkdtempSync(join(tmpdir(), 'tripkit-vid-'));
    // Stub map stitching with a 1x1 png so we don't hit the network in CI.
    const onePx = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const { writeFileSync } = await import('node:fs');
    const props = await buildProps(
      { trip, narration: [], provider, tts: null, music: null, assetsDir, fps: 30 },
      { stitch: async (_v, _p, out) => writeFileSync(out, onePx), synth: null, captionsFor: async (_a, s, t) => tokensForText(t, s) }
    );
    const serveUrl = await bundle({ entryPoint: resolve(here, '..', 'src', 'index.ts') });
    const composition = await selectComposition({ serveUrl, id: 'Trip', inputProps: props });
    expect(composition.durationInFrames).toBeGreaterThan(0);
    const out = join(assetsDir, 'still.png');
    await renderStill({ composition, serveUrl, frame: 1, output: out, inputProps: props });
    const { statSync } = await import('node:fs');
    expect(statSync(out).size).toBeGreaterThan(0);
  }, 120_000);
});
```

- [ ] **Step 3: Run the smoke test**

Run: `cd renderers/remotion && npx vitest run tests/smoke.test.ts`
Expected: PASS (downloads a headless-Chrome build on first run; allow time). If `staticFile` path resolution fails, fix per the NOTE in Step 1 (point the bundle's public dir at the assets dir) until the still renders.

- [ ] **Step 4: Manual full render (documented, not CI)**

Run (requires `MAPTILER_KEY` or `--tiles esri`):
```bash
cd renderers/remotion && npx tsx scripts/video.ts tests/fixtures/mini-trip.yaml /tmp/trip.mp4 --tiles esri
open /tmp/trip.mp4
```
Expected: a short MP4 that flies across the map drawing the route, shows the one Lower Yosemite Fall photo, day/stop title cards, default music. Confirm visually.

- [ ] **Step 5: Commit**

```bash
git add renderers/remotion/scripts/video.ts renderers/remotion/tests/smoke.test.ts
git commit -m "feat(video): video CLI (prepare+render) + single-still smoke test"
```

---

## Task 13: Docs, agent Phase 6, core wiring

**Files:**
- Create: `renderers/remotion/README.md`
- Modify: `agent/SKILL.md` (add Phase 6)
- Modify: `README.md` (link the video renderer)
- Modify: `.planning/ROADMAP.md` (mark the Remotion item done)
- Modify: `CHANGELOG.md` (`[Unreleased]`)

**Interfaces:** docs only.

- [ ] **Step 1: Write `renderers/remotion/README.md`**

````markdown
# TripKit Video Renderer (Remotion)

Turn a media-populated `trip.yaml` into a narrated trip-recap MP4 — a map that
flies between stops drawing the route, photo montages, title cards, subtitles,
music, and optional first-person narration.

> **Opt-in & heavy.** This is a separate package from core `tripkit`. It pulls in
> Remotion, React, a headless-Chrome build, and ffmpeg. Install only if you want video.

## Setup

```bash
cd renderers/remotion
npm install
export MAPTILER_KEY=…        # free key from https://maptiler.com (default tiles)
# or render non-commercially with --tiles esri (no key; Esri attribution shown)
```

## Make a video

```bash
# 1. (optional) scaffold narration, then rewrite each script in first-person
npm run narrate -- ../../my-trip.yaml
#    → my-trip.narration.yaml — hand to an AI agent or edit yourself

# 2. render
npm run video -- ../../my-trip.yaml out.mp4                 # captions + default music
npm run video -- ../../my-trip.yaml out.mp4 --narrate       # + TTS narration + subtitles
npm run video -- ../../my-trip.yaml out.mp4 --music track.mp3
npm run video -- ../../my-trip.yaml out.mp4 --music ai --narrate
```

Flags: `--narrate` (needs `TRIPKIT_TTS_KEY`), `--music <file|ai>` (`ai` needs
`TRIPKIT_MUSIC_KEY`), `--tiles <maptiler|esri>`.

## Licensing

- **Remotion** is free for individuals, non-profits, and companies with ≤3
  employees; 4+ employees need a paid Remotion Company License (remotion.pro).
- **Map tiles in distributed video:** use **MapTiler** (default) or another
  provider whose terms permit rendered/exported media, with attribution shown
  on-screen. **Esri** public tiles (`--tiles esri`) are **non-commercial only** —
  don't monetize Esri-tiled output.
- Replace `assets/music/default.mp3` with a real royalty-free track before
  distributing (the committed file is a placeholder).
````

- [ ] **Step 2: Add Phase 6 to `agent/SKILL.md`** (after the Phase 5 block)

```markdown
### Phase 6: Trip video narration (optional)

If the traveler wants a recap **video** (the `renderers/remotion/` package), they run
`npm run narrate -- trip.yaml` to scaffold `trip.narration.yaml` (one entry per stop).
Your job: rewrite each `script` as **first-person-plural ("we/our")** travel narration —
as if the traveler is recalling the trip. Ground it in the stop's `description`, the real
photo `caption`s from Phase 5, and the `agent_context.iteration_log`, so it sounds like a
genuine memory rather than generic travel copy. Keep ~1 sentence per few seconds of the
stop's photo montage. Example: *"We crested the ridge and there it was — Multnomah Falls,
roaring with spring snowmelt."* Then the traveler renders with `--narrate`.
```

- [ ] **Step 3: Link the renderer from the main `README.md`** (in the media section)

Add after the media-guide pointer:
```markdown
🎬 **Make a trip video:** the [Remotion video renderer](renderers/remotion/README.md) turns the same media-populated trip into a narrated recap MP4 — map flys, photo montages, captions, music. Opt-in (`cd renderers/remotion && npm install`).
```

- [ ] **Step 4: Update `.planning/ROADMAP.md`** — change the Trip-video line to:
```markdown
- [x] **Trip video (Remotion)** — `renderers/remotion/` opt-in package: static-tile map flys with animated route-line draw, per-stop photo montages, title cards, burned-in subtitles, music, and optional first-person TTS narration (via a reviewable `trip.narration.yaml`). MapTiler default tiles; Esri non-commercial fallback.
```

- [ ] **Step 5: Add a `CHANGELOG.md` `[Unreleased]` entry**

```markdown
### Added
- **Trip video renderer (Remotion).** New opt-in `renderers/remotion/` package turns a media-populated `trip.yaml` into a narrated recap MP4: static-tile map that flies between stops drawing the route (`@remotion/paths`), per-stop Ken Burns photo montages with transitions, animated day/stop title cards, optional first-person TTS narration with burned-in auto-captions, and background music (user file, bundled default, or AI-generated). Pluggable tile/TTS/music adapters; MapTiler default tiles (Esri non-commercial fallback). Prepare→render split keeps frame capture deterministic. New agent skill Phase 6 writes the first-person narration script. Core `tripkit` package and its dependencies are unchanged.
```

- [ ] **Step 6: Verify core test suite is untouched**

Run: `cd /Users/pkwidzin/projects/tripkit && npm test`
Expected: PASS — the core suite (validator + skill-coverage + media lifecycle) still green; no new core deps.

- [ ] **Step 7: Commit**

```bash
git add renderers/remotion/README.md agent/SKILL.md README.md .planning/ROADMAP.md CHANGELOG.md
git commit -m "docs(video): renderer README, agent Phase 6, README/ROADMAP/CHANGELOG"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** prepare→render split (Tasks 9–12), static-tile map fly + van Wijk camera (Task 10 MapFly), route-line draw via `@remotion/paths` (Task 10), photo montage + transitions (Task 10), title cards (Task 10), subtitles + whisper with even-split fallback (Tasks 8, 10), pluggable tile/TTS/music adapters (Tasks 4, 6), first-person narration artifact + agent Phase 6 (Tasks 7, 11, 13), determinism (props-only components; assets baked in prepare), graceful degradation (no-media → no montage; `--narrate` no key → clear error; whisper-absent → fallback captions; music default), tile licensing (MapTiler default + Esri warning), Remotion license doc (Task 13 README). 16:9/1920×1080/30fps in `build-props` + `Root`.
- **Cinematic polish (motion blur, drift):** the spec lists these as in-scope. They are intentionally deferred to a fast follow within Task 10's component files (wrap `MapFly` in `<CameraMotionBlur>`, add `noise2D` drift to `PhotoMontage`) — the implementer adds them once the base composition renders cleanly, since they're additive styling on already-tested components. Not given separate failing tests because they're visual-only; verified in the manual render (Task 12 Step 4).
- **Type consistency:** `VideoProps`/`SegmentProps`/`CaptionToken` defined once in `prepare/types.ts` (Task 3) and consumed unchanged by build-props (Task 9) and all components (Task 10).
- **Determinism:** every network/AI call is in prepare (Tasks 4–9); components read only props/staticFile (Task 10).
```
