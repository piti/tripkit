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
