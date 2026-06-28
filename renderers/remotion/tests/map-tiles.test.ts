import { describe, it, expect } from 'vitest';
import { computeSegmentView, projectRoute } from '../prepare/map-tiles';

describe('segment view geometry', () => {
  it('frames a single point centered (no from-point)', () => {
    const v = computeSegmentView(null, { lat: 37.7561, lng: -119.5966 }, { width: 1920, height: 1080 });
    expect(v.width).toBe(1920);
    expect(v.height).toBe(1080);
    expect(v.zoom).toBeGreaterThan(0);
    expect(v.zoom).toBeLessThanOrEqual(18);
  });

  it('chooses a lower zoom when the two points are far apart', () => {
    const near = computeSegmentView({ lat: 37.7561, lng: -119.5966 }, { lat: 37.7159, lng: -119.6770 }, { width: 1920, height: 1080 });
    const far = computeSegmentView({ lat: 37.7561, lng: -119.5966 }, { lat: 36.7378, lng: -119.7871 }, { width: 1920, height: 1080 });
    expect(far.zoom).toBeLessThan(near.zoom);
  });

  it('projects waypoints into image pixels within the frame', () => {
    const v = computeSegmentView(null, { lat: 37.7561, lng: -119.5966 }, { width: 1920, height: 1080 });
    const px = projectRoute([{ lat: 37.7561, lng: -119.5966 }], v.zoom, v.origin);
    expect(px).toHaveLength(1);
    expect(px[0].x).toBeGreaterThan(0);
    expect(px[0].x).toBeLessThan(1920);
    expect(px[0].y).toBeGreaterThan(0);
    expect(px[0].y).toBeLessThan(1080);
  });
});
