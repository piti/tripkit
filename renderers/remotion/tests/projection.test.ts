import { describe, it, expect } from 'vitest';
import { latLngToWorld, latLngToPixel, worldSize, MAX_LAT } from '../prepare/projection.js';

describe('projection', () => {
  it('puts (0,0) at the center of the zoom-0 world (128,128)', () => {
    const p = latLngToWorld(0, 0, 0);
    expect(p.x).toBeCloseTo(128, 6);
    expect(p.y).toBeCloseTo(128, 6);
  });

  it('matches a known reference point (SF at zoom 0)', () => {
    const p = latLngToWorld(37.7749, -122.4194, 0);
    expect(p.x).toBeCloseTo(40.9462, 3);
    expect(p.y).toBeCloseTo(98.9494, 3);
  });

  it('scales by 2^zoom', () => {
    expect(worldSize(0)).toBe(256);
    expect(worldSize(10)).toBe(262144);
    const p = latLngToWorld(37.7749, -122.4194, 10);
    expect(p.x).toBeCloseTo(41928.9133, 2);
  });

  it('subtracts the image origin', () => {
    const p = latLngToPixel(0, 0, 0, { x: 100, y: 100 });
    expect(p.x).toBeCloseTo(28, 6);
    expect(p.y).toBeCloseTo(28, 6);
  });

  it('clamps latitude to the Web Mercator limit', () => {
    const beyond = latLngToWorld(89, 0, 0);
    const atLimit = latLngToWorld(MAX_LAT, 0, 0);
    expect(beyond.y).toBeCloseTo(atLimit.y, 6);
  });
});
