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
