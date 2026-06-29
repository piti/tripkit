import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTrip, flattenStops } from '../prepare/read-trip';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'mini-trip.yaml');

describe('read-trip', () => {
  it('loads the trip and its days', () => {
    const trip = readTrip(fixture);
    expect(trip.trip.title).toBe('Test Trip');
    expect(trip.days).toHaveLength(2);
  });

  it('flattens stops in order with day context', () => {
    const flat = flattenStops(readTrip(fixture));
    expect(flat).toHaveLength(3);
    expect(flat[0].stop.name).toBe('Lower Yosemite Fall');
    expect(flat[0].day).toBe(1);
    expect(flat[0].stopIndex).toBe(0);
    expect(flat[0].dayColor).toBe('#2e7db5');
    expect(flat[2].stop.name).toBe('Mariposa Grove');
    expect(flat[2].day).toBe(2);
  });

  it('drops stops without finite coordinates', () => {
    const flat = flattenStops({
      trip: { title: 't' },
      days: [{ number: 1, title: 'd', date: 'x', stops: [
        { name: 'ok', lat: 1, lng: 2 },
        { name: 'bad', lat: NaN as unknown as number, lng: 2 },
      ] }],
    } as never);
    expect(flat).toHaveLength(1);
    expect(flat[0].stop.name).toBe('ok');
  });
});
