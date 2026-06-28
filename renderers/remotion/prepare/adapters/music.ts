import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRACK = join(here, '..', '..', 'assets', 'music', 'default.mp3');

// Cheap sniff: does this file start with a plausible audio header? Guards against a
// non-audio file (e.g. a placeholder text stub) reaching ffprobe and crashing the
// render. We accept MP3 (ID3 tag or 0xFFEx frame sync), and the common containers
// Remotion can decode (WAV "RIFF", M4A/AAC "ftyp", OGG "OggS").
function looksLikeAudio(path: string): boolean {
  try {
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(12);
    const n = readSync(fd, buf, 0, 12, 0);
    closeSync(fd);
    if (n < 4) return false;
    if (buf.slice(0, 3).toString('latin1') === 'ID3') return true;       // MP3 w/ ID3
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;         // MP3 frame sync
    if (buf.slice(0, 4).toString('latin1') === 'RIFF') return true;      // WAV
    if (buf.slice(0, 4).toString('latin1') === 'OggS') return true;      // OGG
    if (buf.slice(4, 8).toString('latin1') === 'ftyp') return true;      // M4A/AAC/MP4
    return false;
  } catch {
    return false;
  }
}

export async function resolveMusic(
  opt: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  outDir = '/tmp'
): Promise<string | null> {
  if (opt === undefined) {
    if (!existsSync(DEFAULT_TRACK)) return null;
    if (!looksLikeAudio(DEFAULT_TRACK)) {
      console.warn('  ⚠ bundled default music track is not a valid audio file — rendering without music.');
      return null;
    }
    return DEFAULT_TRACK;
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
  if (!looksLikeAudio(opt)) {
    console.warn(`  ⚠ "${opt}" does not look like a supported audio file — rendering without music.`);
    return null;
  }
  return opt;
}
