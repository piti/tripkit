import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readTrip } from '../prepare/read-trip';
import { getTileProvider } from '../prepare/adapters/tiles';
import { buildProps } from '../prepare/build-props';
import { tokensForText } from '../prepare/captions';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { webpackOverride } from '../src/webpack-override';

const here = dirname(fileURLToPath(import.meta.url));

describe('render smoke (mounts + single still)', () => {
  it('bundles, selects the Trip composition, and renders one frame', async () => {
    const trip = readTrip(join(here, 'fixtures', 'mini-trip.yaml'));
    const provider = getTileProvider('esri', {} as never); // no key needed

    // The composition resolves assets via staticFile('generated/<file>'), so the served
    // public dir must contain a `generated/` folder holding the prepared assets. Lay the
    // temp tree out the same way the real CLI does: publicDir/generated/<assets>.
    const publicDir = mkdtempSync(join(tmpdir(), 'tripkit-vid-'));
    const assetsDir = join(publicDir, 'generated');
    mkdirSync(assetsDir, { recursive: true });

    // Stub map stitching with a 1x1 png so we don't hit the network in CI.
    const onePx = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    // The fixture references a relative photo (media/fall_01.jpg) which the composition
    // also fetches via staticFile; stub it so the still doesn't 404 on the <Img>.
    mkdirSync(join(assetsDir, 'media'), { recursive: true });
    writeFileSync(join(assetsDir, 'media', 'fall_01.jpg'), onePx);

    const props = await buildProps(
      { trip, narration: [], provider, tts: null, music: null, assetsDir, fps: 30 },
      {
        stitch: async (_v, _p, out) => writeFileSync(out, onePx),
        synth: null,
        captionsFor: async (_a, s, t) => tokensForText(t, s),
      }
    );

    const serveUrl = await bundle({ entryPoint: resolve(here, '..', 'src', 'index.ts'), publicDir, webpackOverride });
    const composition = await selectComposition({ serveUrl, id: 'Trip', inputProps: props });
    expect(composition.durationInFrames).toBeGreaterThan(0);

    const out = join(assetsDir, 'still.png');
    await renderStill({ composition, serveUrl, frame: 1, output: out, inputProps: props, imageFormat: 'png' });
    expect(statSync(out).size).toBeGreaterThan(0);
  }, 180_000);
});
