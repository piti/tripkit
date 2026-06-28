import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { flattenStops } from './read-trip.js';
import { computeSegmentView, computeFullView, projectRoute } from './map-tiles.js';
import type { Trip, NarrationEntry, VideoProps, SegmentProps, IntroProps, CaptionToken } from './types.js';
import type { TileProvider } from './adapters/tiles.js';
import type { TtsAdapter } from './adapters/tts.js';

const W = 1920, H = 1080;
// Each stop spends a "map-first beat" (~3s, route draws on the bare map) before the
// photo montage fades in, so segments need room for both. Tuned for a cinematic pace.
const BASE_SECONDS_PER_STOP = 8;       // when no narration
const MIN_SECONDS_PER_STOP = 6;
const INTRO_SECONDS = 4;               // opening hero card showing the whole trip

// Cumulative pixel length of a polyline up to each vertex: lengths[i] is the
// distance from point 0 to point i. Used to map a "draw up to vertex K" reveal
// onto a 0..1 strokeDashoffset fraction so prior legs render already-drawn.
function cumulativeLengths(pts: { x: number; y: number }[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
}

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

  // The full journey as an ordered lat/lng path: origin (if known) then every stop.
  // Each segment draws this whole path up to its own stop, so legs connect end to end.
  const pathLatLng: { lat: number; lng: number }[] = [
    ...(origin ? [origin] : []),
    ...flat.map((f) => ({ lat: f.stop.lat, lng: f.stop.lng })),
  ];

  for (let i = 0; i < flat.length; i++) {
    const cur = flat[i];
    const prevLatLng = i === 0 ? origin : { lat: flat[i - 1].stop.lat, lng: flat[i - 1].stop.lng };
    const toLatLng = { lat: cur.stop.lat, lng: cur.stop.lng };
    const view = computeSegmentView(prevLatLng, toLatLng, { width: W, height: H });

    const mapImage = join(opts.assetsDir, `map-${i}.png`);
    await deps.stitch(view, opts.provider, mapImage);

    const prevStop = i > 0 ? { lat: flat[i - 1].stop.lat, lng: flat[i - 1].stop.lng } : null;
    // Cumulative route: origin..current stop. `curVertex` is this stop's index in
    // pathLatLng; `prevVertex` is the vertex before it (where the new leg starts).
    const curVertex = (origin ? 1 : 0) + i;
    const routeLatLng = pathLatLng.slice(0, curVertex + 1);
    const routePx = projectRoute(routeLatLng, view.zoom, view.origin);
    const lens = cumulativeLengths(routePx);
    const total = lens[lens.length - 1] || 1;
    const revealFrom = curVertex > 0 ? lens[curVertex - 1] / total : 0;
    const toPx = projectRoute([toLatLng], view.zoom, view.origin)[0];
    const fromPx = prevStop ? projectRoute([prevStop], view.zoom, view.origin)[0] : null;

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
      revealFrom,
      photos: (cur.stop.media || []).filter((m) => m.type === 'photo').map((m) => m.src),
      narrationAudio: narrationAudio ? `narration-${i}.mp3` : null,
      narrationSeconds,
      captions,
      durationInFrames,
    });
  }

  // Opening hero card: one wide map of the whole route, used as the title beat
  // and (its first frame) the video thumbnail. Needs at least two path points.
  let intro: IntroProps | null = null;
  if (pathLatLng.length >= 2) {
    const introView = computeFullView(pathLatLng, { width: W, height: H, padding: 0.45 });
    const introImage = join(opts.assetsDir, `map-intro.png`);
    await deps.stitch(introView, opts.provider, introImage);
    intro = {
      mapImage: `map-intro.png`,
      mapWidth: introView.width,
      mapHeight: introView.height,
      routePx: projectRoute(pathLatLng, introView.zoom, introView.origin),
      routeColor: flat[0]?.dayColor ?? '#2e7db5',
      durationInFrames: Math.ceil(INTRO_SECONDS * fps),
    };
  }

  return {
    title: opts.trip.trip.title,
    subtitle: opts.trip.trip.subtitle ?? '',
    dates: opts.trip.trip.dates ?? '',
    fps, width: W, height: H,
    music: opts.music,
    attribution: opts.provider.attribution,
    intro,
    segments,
  };
}
