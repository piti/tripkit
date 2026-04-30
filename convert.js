#!/usr/bin/env node
/**
 * TripKit CLI — Convert YAML trip data to interactive HTML, or validate a YAML file.
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

const { validate } = require('./validate');

const invokedAs = path.basename(process.argv[1] || 'tripkit') === 'convert.js'
  ? 'node convert.js'
  : 'tripkit';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
TripKit — AI-friendly trip planning toolkit

Usage:
  ${invokedAs} <trip.yaml> [output.html]    Render YAML to interactive HTML
  ${invokedAs} validate <trip.yaml>         Check a trip YAML for schema errors

Flags:
  -h, --help       Show this help
  -v, --version    Show version
  --no-validate    Skip the pre-render validation pass (renders even with warnings)
`);
}

if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  printHelp();
  process.exit(0);
}

if (args[0] === '-v' || args[0] === '--version') {
  console.log(require(path.join(__dirname, 'package.json')).version);
  process.exit(0);
}

// --- ANSI color helpers (auto-disabled when not a TTY or NO_COLOR is set) ---
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { red: s => `\x1b[31m${s}\x1b[0m`, yellow: s => `\x1b[33m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m` }
  : { red: s => s, yellow: s => s, green: s => s, dim: s => s, bold: s => s };

function loadYaml(inputFile) {
  if (!fs.existsSync(inputFile)) {
    console.error(c.red(`Error: file not found: ${inputFile}`));
    process.exit(1);
  }
  try {
    return yaml.load(fs.readFileSync(inputFile, 'utf8'));
  } catch (e) {
    console.error(c.red(`YAML parse error in ${inputFile}:`));
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

function reportFindings(errors, warnings) {
  errors.forEach(({ path: p, message }) => {
    console.error(`  ${c.red('✖')} ${c.bold(p)} — ${message}`);
  });
  warnings.forEach(({ path: p, message }) => {
    console.error(`  ${c.yellow('⚠')} ${c.bold(p)} — ${message}`);
  });
}

// === SUBCOMMAND: validate ===
if (args[0] === 'validate') {
  const inputFile = args[1];
  if (!inputFile) {
    console.error(c.red('Usage: ') + `${invokedAs} validate <trip.yaml>`);
    process.exit(1);
  }
  const tripData = loadYaml(inputFile);
  const { errors, warnings } = validate(tripData);
  if (errors.length === 0 && warnings.length === 0) {
    console.log(c.green('✓') + ` ${inputFile} is valid`);
    process.exit(0);
  }
  console.log(c.bold(`${inputFile}`));
  reportFindings(errors, warnings);
  console.log('');
  console.log(`  ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  process.exit(errors.length > 0 ? 1 : 0);
}

// === DEFAULT: render ===
const skipValidate = args.includes('--no-validate');
const positional = args.filter(a => !a.startsWith('-'));
const inputFile = positional[0];
const outputFile = positional[1] || inputFile.replace(/\.ya?ml$/, '.html');

const tripData = loadYaml(inputFile);

if (!skipValidate) {
  const { errors, warnings } = validate(tripData);
  if (errors.length > 0) {
    console.error(c.red(`✖ Validation failed for ${inputFile}:`));
    reportFindings(errors, warnings);
    console.error('');
    console.error(c.dim(`Fix the errors above, or pass --no-validate to render anyway.`));
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.error(c.yellow(`⚠ Validation warnings for ${inputFile}:`));
    reportFindings([], warnings);
    console.error('');
  }
}

// Read HTML template
const templatePath = path.join(__dirname, 'renderers', 'html', 'tripkit-renderer.html');
let template = fs.readFileSync(templatePath, 'utf8');

// Embed trip data into template
const jsonData = JSON.stringify(tripData, null, 2);
template = template.replace(
  'const TRIP_DATA = {};',
  `const TRIP_DATA = ${jsonData};`
);

fs.writeFileSync(outputFile, template, 'utf8');
console.log(`✅ Generated: ${outputFile}`);
console.log(`   ${tripData.trip.title} — ${tripData.trip.total_days} days, ${tripData.trip.total_stops} stops`);
