import { flattenStops } from './read-trip.js';
import type { Trip, NarrationEntry } from './types.js';

export function buildNarrationScaffold(trip: Trip): {
  _instructions: string[];
  voice: string;
  stops: NarrationEntry[];
} {
  const stops: NarrationEntry[] = flattenStops(trip).map(({ day, stopIndex, stop }) => {
    const captionBits = (stop.media || []).map((m) => m.caption).filter(Boolean).join('. ');
    const seed = [stop.description, captionBits].filter(Boolean).join(' ');
    return { day, stop_index: stopIndex, stop: stop.name, script: seed };
  });
  return {
    _instructions: [
      'Rewrite each `script` as first-person-plural ("we/our") travel narration — as if recalling the trip.',
      'Ground it in the real stop, its photo captions, and the trip itinerary. ~1 sentence per few seconds.',
      'Then render: npm run video -- <trip.yaml> out.mp4 --narrate',
    ],
    voice: 'first-person plural (we/our)',
    stops,
  };
}
