import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTrip } from '../prepare/read-trip';
import { buildNarrationScaffold } from '../prepare/narration-scaffold';

const here = dirname(fileURLToPath(import.meta.url));
const trip = readTrip(join(here, 'fixtures', 'mini-trip.yaml'));

describe('narration scaffold', () => {
  it('emits one entry per stop with day/stop_index/name', () => {
    const s = buildNarrationScaffold(trip);
    expect(s.stops).toHaveLength(3);
    expect(s.stops[0]).toMatchObject({ day: 1, stop_index: 0, stop: 'Lower Yosemite Fall' });
  });

  it('pre-fills script from the stop description', () => {
    const s = buildNarrationScaffold(trip);
    expect(s.stops[0].script).toContain('lower fall');
  });

  it('declares the first-person-plural voice for the agent', () => {
    const s = buildNarrationScaffold(trip);
    expect(s.voice).toMatch(/first-person plural/i);
    expect(s._instructions.join(' ')).toMatch(/we|our/i);
  });
});
