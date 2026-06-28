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
