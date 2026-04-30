#!/usr/bin/env node
/**
 * TripKit CLI — Convert YAML trip data to interactive HTML
 */

const fs = require('fs');
const path = require('path');

let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  console.error('Missing dependency. Run: npm install (from the tripkit directory)');
  process.exit(1);
}

const invokedAs = path.basename(process.argv[1] || 'tripkit') === 'convert.js'
  ? 'node convert.js'
  : 'tripkit';

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  console.log(`
TripKit — Convert YAML trip data to interactive HTML

Usage:
  ${invokedAs} <trip.yaml> [output.html]

Example:
  ${invokedAs} my-trip.yaml my-trip.html

Flags:
  -h, --help       Show this help
  -v, --version    Show version
`);
  process.exit(0);
}

if (args[0] === '-v' || args[0] === '--version') {
  console.log(require(path.join(__dirname, 'package.json')).version);
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
