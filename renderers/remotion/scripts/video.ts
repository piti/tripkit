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
import { webpackOverride } from '../src/webpack-override.js';

const here = dirname(fileURLToPath(import.meta.url));

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean { return process.argv.includes(`--${name}`); }

async function main() {
  const tripPath = process.argv[2];
  const outPath = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'out.mp4';
  if (!tripPath || tripPath.startsWith('--')) {
    console.error('Usage: npm run video -- <trip.yaml> <out.mp4> [--narrate] [--music <file|ai>] [--tiles <provider>]');
    process.exit(1);
  }

  const narrate = has('narrate');
  const provider = getTileProvider(flag('tiles'));
  const tts = narrate ? getTtsAdapter() : null;

  // Remotion's staticFile() resolves relative to a `public/` directory. The composition
  // references assets as `generated/<file>`, so the served public dir is `assets/` and the
  // generated assets live in `assets/generated/`.
  const publicDir = resolve(here, '..', 'assets');
  const assetsDir = join(publicDir, 'generated');
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
  const serveUrl = await bundle({ entryPoint: resolve(here, '..', 'src', 'index.ts'), publicDir, webpackOverride });
  const composition = await selectComposition({ serveUrl, id: 'Trip', inputProps: finalProps });

  console.log(`Rendering ${composition.durationInFrames} frames → ${outPath}`);
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: outPath, inputProps: finalProps,
    onProgress: ({ progress }) => process.stdout.write(`\r  ${Math.round(progress * 100)}%`),
  });
  console.log(`\n✓ ${outPath}`);
}
main().catch((e) => { console.error('\n✖ ' + e.message); process.exit(1); });
