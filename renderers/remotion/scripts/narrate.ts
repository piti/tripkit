import { writeFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { readTrip } from '../prepare/read-trip.js';
import { buildNarrationScaffold } from '../prepare/narration-scaffold.js';

const tripPath = process.argv[2];
if (!tripPath) {
  console.error('Usage: npm run narrate -- <trip.yaml>');
  process.exit(1);
}
const trip = readTrip(tripPath);
const scaffold = buildNarrationScaffold(trip);
const outPath = tripPath.replace(/\.ya?ml$/i, '') + '.narration.yaml';
writeFileSync(outPath, yaml.dump(scaffold, { lineWidth: 100 }), 'utf8');
console.log(`✓ Wrote ${outPath} (${scaffold.stops.length} stops).`);
console.log('  Rewrite each `script` as first-person-plural narration, then render with --narrate.');
