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

    const prevStop = i > 0 ? { lat: flat[i - 1].stop.lat, lng: flat[i - 1].stop.lng } : null;
    const routeLatLng = prevLatLng ? [prevLatLng, toLatLng] : [toLatLng];
    const routePx = projectRoute(routeLatLng, view.zoom, view.origin);
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
