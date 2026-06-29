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

  it('builds cumulative routes: each segment extends the prior path', async () => {
    const props = await buildProps({
      trip, narration: [], provider, tts: null, music: null, assetsDir: '/tmp/a', fps: 30,
    }, noNarration);
    // origin + N stops: segment i's polyline has (origin?1:0)+i+1 vertices.
    // origin present, so seg0 has 2 points (origin->stop0), seg1 has 3, seg2 has 4.
    expect(props.segments[0].routePx).toHaveLength(2);
    expect(props.segments[1].routePx).toHaveLength(3);
    expect(props.segments[2].routePx).toHaveLength(4);
    // seg0 draws origin->stop0 from scratch (nothing prior), so revealFrom is 0.
    // Each later segment starts with its prior legs already drawn — revealFrom is the
    // fraction of THAT segment's own (re-projected) polyline already covered, so it's
    // strictly inside (0,1). It is not comparable across segments (each has its own zoom).
    expect(props.segments[0].revealFrom).toBe(0);
    for (const seg of props.segments.slice(1)) {
      expect(seg.revealFrom).toBeGreaterThan(0);
      expect(seg.revealFrom).toBeLessThan(1);
    }
  });

  it('produces an intro hero card with the full route and dates', async () => {
    const props = await buildProps({
      trip, narration: [], provider, tts: null, music: null, assetsDir: '/tmp/a', fps: 30,
    }, noNarration);
    expect(props.intro).not.toBeNull();
    // origin + 3 stops = 4 vertices on the full route.
    expect(props.intro!.routePx).toHaveLength(4);
    expect(props.intro!.durationInFrames).toBeGreaterThan(0);
    expect(props.dates).toBe('May 15-16, 2026');
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
