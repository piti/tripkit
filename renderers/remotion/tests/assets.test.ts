import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { copyLocalPhotos } from '../scripts/video';
import type { SegmentProps } from '../prepare/types';

function seg(photos: string[]): SegmentProps {
  return {
    day: 1, stopIndex: 0, title: 't', dayTitle: '', date: '', dayColor: '#000',
    description: '', mapImage: 'map-0.png', mapWidth: 1920, mapHeight: 1080,
    fromPx: null, toPx: { x: 0, y: 0 }, routePx: [], photos,
    narrationAudio: null, narrationSeconds: null, captions: [], durationInFrames: 120,
  };
}

describe('copyLocalPhotos', () => {
  it('copies a local photo into assetsDir preserving its relative subpath', () => {
    // Lay out a trip dir with a real local photo, and a separate assets dir.
    const tripDir = mkdtempSync(join(tmpdir(), 'tripkit-trip-'));
    const assetsDir = mkdtempSync(join(tmpdir(), 'tripkit-assets-'));
    mkdirSync(join(tripDir, 'media'), { recursive: true });
    writeFileSync(join(tripDir, 'media', 'fall_01.jpg'), Buffer.from('JPEGDATA'));

    // Note: we deliberately do NOT pre-stub the file under assetsDir — the copy must create it.
    copyLocalPhotos([seg(['media/fall_01.jpg'])], tripDir, assetsDir);

    const dest = join(assetsDir, 'media', 'fall_01.jpg');
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).toString()).toBe('JPEGDATA');
  });

  it('skips http(s) srcs (no attempt to copy a remote URL)', () => {
    const tripDir = mkdtempSync(join(tmpdir(), 'tripkit-trip-'));
    const assetsDir = mkdtempSync(join(tmpdir(), 'tripkit-assets-'));

    // Should not throw even though the URL has no corresponding local file.
    expect(() =>
      copyLocalPhotos([seg(['https://example.com/remote.jpg'])], tripDir, assetsDir)
    ).not.toThrow();

    // And nothing should have been written under assetsDir for the URL.
    expect(existsSync(join(assetsDir, 'https:'))).toBe(false);
    expect(existsSync(join(assetsDir, 'remote.jpg'))).toBe(false);
  });
});
