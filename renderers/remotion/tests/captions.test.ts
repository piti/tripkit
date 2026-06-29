import { describe, it, expect } from 'vitest';
import { tokensForText } from '../prepare/captions';

describe('caption fallback', () => {
  it('distributes words across the duration', () => {
    const toks = tokensForText('we hiked to the falls', 5);
    expect(toks).toHaveLength(5);
    expect(toks[0].fromMs).toBe(0);
    expect(toks[4].toMs).toBeCloseTo(5000, 0);
    // monotonically increasing
    for (let i = 1; i < toks.length; i++) expect(toks[i].fromMs).toBeGreaterThanOrEqual(toks[i - 1].fromMs);
  });

  it('returns [] for empty text', () => {
    expect(tokensForText('', 5)).toEqual([]);
  });
});
