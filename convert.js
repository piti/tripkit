#!/usr/bin/env node
/**
 * TripKit CLI — Convert YAML trip data to interactive HTML
 * 
 * Usage:
 *   node convert.js <trip.yaml> [output.html]
 * 
 * Example:
 *   node convert.js examples/oregon-spring-2026.yaml my-trip.html
 * 
 * Dependencies:
 *   npm install js-yaml
 */

const fs = require('fs');
const path = require('path');

try {
  require.resolve('js-yaml');
} catch (e) {
  console.error('Missing dependency. Run: npm install js-yaml');
  process.exit(1);
}

const yaml = require('js-yaml');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`
TripKit — Convert YAML trip data to interactive HTML

Usage:
  node convert.js <trip.yaml> [output.html]

Example:
  node convert.js examples/oregon-spring-2026.yaml my-trip.html
`);
  process.exit(0);
}

const inputFile = args[0];
const outputFile = args[1] || inputFile.replace(/\.ya?ml$/, '.html');

// Read and parse YAML
const yamlContent = fs.readFileSync(inputFile, 'utf8');
const tripData = yaml.load(yamlContent);

// Read HTML template
const templatePath = path.join(__dirname, 'renderers', 'html', 'tripkit-renderer.html');
let template = fs.readFileSync(templatePath, 'utf8');

// Embed trip data into template
const jsonData = JSON.stringify(tripData, null, 2);
template = template.replace(
  'const TRIP_DATA = {};',
  `const TRIP_DATA = ${jsonData};`
);

// Write output
fs.writeFileSync(outputFile, template, 'utf8');
console.log(`✅ Generated: ${outputFile}`);
console.log(`   ${tripData.trip.title} — ${tripData.trip.total_days} days, ${tripData.trip.total_stops} stops`);
