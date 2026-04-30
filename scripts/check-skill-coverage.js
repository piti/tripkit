#!/usr/bin/env node
/**
 * Coverage check: every renderer-meaningful schema field must be mentioned
 * by name in the agent skill. Prevents drift when fields are added.
 *
 * Run: node scripts/check-skill-coverage.js
 * (also wired into `npm test`)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const skill = fs.readFileSync(path.join(ROOT, 'agent', 'SKILL.md'), 'utf8');

// Hand-curated list of fields the agent must know about. When you add a renderer-
// meaningful field, add it here and to agent/SKILL.md in the same change.
const REQUIRED_FIELDS = [
  // trip
  'trip.title', 'trip.dates', 'trip.total_days', 'trip.total_stops',
  'trip.origin', 'trip.origin_lat', 'trip.origin_lng',
  'trip.destination_lat', 'trip.destination_lng',
  // days
  'days[].number', 'days[].title', 'days[].date', 'days[].status', 'days[].color',
  'days[].summary', 'days[].weather', 'days[].meals', 'days[].lodging',
  'days[].alerts', 'days[].tips', 'days[].stops',
  // stops
  'stops[].name', 'stops[].lat', 'stops[].lng', 'stops[].type', 'stops[].label',
  'stops[].description', 'stops[].kid_friendly', 'stops[].reservation_required',
  'stops[].navigate_url',
  // lodging
  'lodging.name', 'lodging.lat', 'lodging.lng', 'lodging.confirmation', 'lodging.booked',
  // routes
  'routes[]',
  // theme
  'theme.font_family', 'theme.accent_color', 'theme.map_style', 'theme.dark_mode',
  'theme.hotel_label',
  // agent_context
  'agent_context.preferences', 'agent_context.constraints', 'agent_context.iteration_log',
];

// Each entry above resolves to one or more "tokens" the skill must contain.
// Strip the path prefix so the lookup is forgiving across formats like
// `trip.origin_lat`, ``trip.origin_lat``, or just `origin_lat`.
function lookupTokens(field) {
  const leaf = field.replace(/^.*\./, '').replace(/\[\]$/, '');
  return [field, leaf];
}

const missing = [];
for (const field of REQUIRED_FIELDS) {
  const tokens = lookupTokens(field);
  const found = tokens.some(t => skill.includes(t));
  if (!found) missing.push(field);
}

if (missing.length === 0) {
  console.log(`✓ agent/SKILL.md covers all ${REQUIRED_FIELDS.length} required fields`);
  process.exit(0);
}

console.error(`✖ agent/SKILL.md is missing references to ${missing.length} required field(s):`);
for (const f of missing) console.error(`  - ${f}`);
console.error('');
console.error('Either add a mention to agent/agent/SKILL.md, or remove it from REQUIRED_FIELDS in this script if the field is no longer renderer-meaningful.');
process.exit(1);
