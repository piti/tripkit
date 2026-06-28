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
