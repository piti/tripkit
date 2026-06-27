#!/usr/bin/env node
/**
 * End-to-end regression test for the post-trip media flow.
 *
 * Exercises the full lifecycle on a freshly-authored trip:
 *   author trip -> validate -> render (pre)        [no media]
 *   -> generate geotagged fixtures
 *   -> `tripkit media` (build review)              [EXIF match + buckets]
 *   -> review/caption + promote an unmatched item  [simulates the human/AI step]
 *   -> `tripkit media apply`                        [merge into stops[].media[]]
 *   -> re-apply                                     [idempotency]
 *   -> validate (errors vs warnings) -> render (post)
 *   -> assert the rendered HTML embeds the media + captions.
 *
 * Self-contained: builds fixtures in an OS temp dir and cleans up. `sharp` is
 * optional — thumbnail assertions soft-pass (with a note) when it isn't installed,
 * so this can run in `npm test` on a sharp-free CI.
 *
 * Run: node scripts/test-media-lifecycle.js   (also wired into `npm test`)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONVERT = path.join(ROOT, 'convert.js');
const yaml = require(path.join(ROOT, 'node_modules', 'js-yaml'));
const { validate } = require(path.join(ROOT, 'validate'));

let sharp = null;
try { sharp = require(path.join(ROOT, 'node_modules', 'sharp')); } catch (_) { /* optional */ }
const HAVE_SHARP = !!sharp;

let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — ${detail || ''}`}`);
  if (!ok) failures++;
}
function soft(name, cond, detail) {
  if (!HAVE_SHARP) { console.log(`  ⊘ ${name} (skipped — sharp not installed)`); return; }
  check(name, cond, detail);
}
function tk(args) {
  return execFileSync('node', [CONVERT, ...args], { env: { ...process.env, NO_COLOR: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// --- Minimal JPEG with GPS + DateTimeOriginal EXIF (no external EXIF writer needed) ---
function buildExif({ lat, lng, dateStr }) {
  const tiff = Buffer.alloc(8192);
  let p = 0;
  const u16 = (v) => { tiff.writeUInt16LE(v, p); p += 2; };
  const u32 = (v) => { tiff.writeUInt32LE(v, p); p += 4; };
  tiff.write('II', p); p += 2; tiff.writeUInt16LE(42, p); p += 2; tiff.writeUInt32LE(8, p); p += 4;
  const dt = Buffer.from(dateStr + '\0', 'ascii');
  const dms = (dec) => { const d = Math.floor(Math.abs(dec)); const mf = (Math.abs(dec) - d) * 60; const m = Math.floor(mf); const s = (mf - m) * 60; return [[d, 1], [m, 1], [Math.round(s * 100), 100]]; };
  const rationals = (arr) => { const b = Buffer.alloc(arr.length * 8); arr.forEach((pr, i) => { b.writeUInt32LE(pr[0], i * 8); b.writeUInt32LE(pr[1], i * 8 + 4); }); return b; };
  const latBuf = rationals(dms(lat)), lngBuf = rationals(dms(lng));
  const latRef = (lat >= 0 ? 'N' : 'S'), lngRef = (lng >= 0 ? 'E' : 'W');
  const IFD0_OFF = 8, IFD0_SIZE = 2 + 2 * 12 + 4;
  const EXIF_OFF = IFD0_OFF + IFD0_SIZE, EXIF_SIZE = 2 + 1 * 12 + 4;
  const GPS_OFF = EXIF_OFF + EXIF_SIZE, GPS_SIZE = 2 + 4 * 12 + 4;
  const DATA_OFF = GPS_OFF + GPS_SIZE;
  const dtOff = DATA_OFF, latOff = dtOff + dt.length, lngOff = latOff + latBuf.length;
  p = IFD0_OFF; u16(2);
  u16(0x8769); u16(4); u32(1); u32(EXIF_OFF);
  u16(0x8825); u16(4); u32(1); u32(GPS_OFF); u32(0);
  p = EXIF_OFF; u16(1); u16(0x9003); u16(2); u32(dt.length); u32(dtOff); u32(0);
  p = GPS_OFF; u16(4);
  u16(0x0001); u16(2); u32(2); { const sp = p; tiff.write(latRef, p, 'ascii'); p = sp + 4; }
  u16(0x0002); u16(5); u32(3); u32(latOff);
  u16(0x0003); u16(2); u32(2); { const sp = p; tiff.write(lngRef, p, 'ascii'); p = sp + 4; }
  u16(0x0004); u16(5); u32(3); u32(lngOff); u32(0);
  dt.copy(tiff, dtOff); latBuf.copy(tiff, latOff); lngBuf.copy(tiff, lngOff);
  return Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff.subarray(0, lngOff + lngBuf.length)]);
}
// A tiny valid baseline JPEG (1x1) we can append EXIF to — avoids needing sharp to make fixtures.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==', 'base64');
function geoJpeg(file, meta) {
  const exif = buildExif(meta);
  const app1Len = exif.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1, (app1Len >> 8) & 0xff, app1Len & 0xff]), exif]);
  fs.writeFileSync(file, Buffer.concat([TINY_JPEG.subarray(0, 2), app1, TINY_JPEG.subarray(2)]));
}
function plainJpeg(file) { fs.writeFileSync(file, TINY_JPEG); }

const TRIP_YAML = `
trip:
  title: "Yosemite Weekend 2026"
  dates: "May 15-16, 2026"
  total_days: 2
  total_stops: 4
  origin: "Fresno, CA"
  origin_lat: 36.7378
  origin_lng: -119.7871
days:
  - number: 1
    title: "Valley Floor"
    date: "Friday, May 15"
    status: completed
    color: "#2e7db5"
    lodging: { name: "Yosemite Valley Lodge", lat: 37.7456, lng: -119.5967 }
    stops:
      - { name: "Lower Yosemite Fall", lat: 37.7561, lng: -119.5966, type: hike, navigate_url: "https://maps.google.com/?q=lyf" }
      - { name: "Tunnel View", lat: 37.7159, lng: -119.6770, type: scenic, navigate_url: "https://maps.google.com/?q=tv" }
  - number: 2
    title: "Mariposa Grove"
    date: "Saturday, May 16"
    status: completed
    color: "#2d7a50"
    lodging: { name: "Home", lat: 36.7378, lng: -119.7871 }
    stops:
      - { name: "Mariposa Grove", lat: 37.5142, lng: -119.6010, type: hike, navigate_url: "https://maps.google.com/?q=mg" }
      - { name: "Glacier Point", lat: 37.7275, lng: -119.5734, type: scenic, navigate_url: "https://maps.google.com/?q=gp" }
`;

function main() {
  console.log(`media lifecycle e2e${HAVE_SHARP ? '' : ' (sharp absent — thumbnail checks skipped)'}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tripkit-media-'));
  const TRIP = path.join(work, 'trip.yaml');
  const MEDIA = path.join(work, 'media');
  const REVIEW = path.join(work, 'trip.media-review.yaml');
  try {
    fs.writeFileSync(TRIP, TRIP_YAML);
    fs.mkdirSync(MEDIA);

    // PRE-TRIP
    check('pre-trip validates clean', /is valid/.test(tk(['validate', TRIP])));
    tk([TRIP, path.join(work, 'pre.html')]);
    const preData = (() => { const h = fs.readFileSync(path.join(work, 'pre.html'), 'utf8'); return h.slice(h.indexOf('const TRIP_DATA ='), h.indexOf('END TRIP DATA')); })();
    check('pre-trip TRIP_DATA has no media', !/"media"\s*:/.test(preData));

    // FIXTURES (day-gated; May 15 = day 1, May 16 = day 2)
    geoJpeg(path.join(MEDIA, 'fall_01.jpg'), { lat: 37.7560, lng: -119.5965, dateStr: '2026:05:15 10:15:00' });
    geoJpeg(path.join(MEDIA, 'fall_02.jpg'), { lat: 37.7562, lng: -119.5968, dateStr: '2026:05:15 10:22:00' });
    geoJpeg(path.join(MEDIA, 'tunnel_01.jpg'), { lat: 37.7160, lng: -119.6771, dateStr: '2026:05:15 16:45:00' });
    geoJpeg(path.join(MEDIA, 'sequoia_01.jpg'), { lat: 37.5141, lng: -119.6011, dateStr: '2026:05:16 09:30:00' });
    geoJpeg(path.join(MEDIA, 'random_sf.jpg'), { lat: 37.7749, lng: -122.4194, dateStr: '2026:05:16 12:00:00' }); // too far
    plainJpeg(path.join(MEDIA, 'no_gps.jpg')); // no GPS

    // INGEST
    tk(['media', MEDIA, TRIP]);
    const review = yaml.load(fs.readFileSync(REVIEW, 'utf8'));
    check('review total = 6', review.summary.total === 6, JSON.stringify(review.summary));
    check('review matched = 4', review.summary.matched === 4, JSON.stringify(review.summary));
    check('review unmatched = 2', review.summary.unmatched === 2, JSON.stringify(review.summary));
    const fall = review.stops.find(s => s.stop === 'Lower Yosemite Fall');
    check('Lower Yosemite Fall = 2 photos, day 1 idx 0', fall && fall.media.length === 2 && fall.day === 1 && fall.stop_index === 0, JSON.stringify(fall && { n: fall.media.length, d: fall.day, i: fall.stop_index }));
    check('Mariposa matched on day 2', !!review.stops.find(s => /Mariposa/.test(s.stop) && s.day === 2));
    check('SF photo unmatched (too far)', review.unmatched.some(u => u.src.includes('random_sf')));
    check('no-GPS photo unmatched', review.unmatched.some(u => u.src.includes('no_gps') && /no GPS/i.test(u.reason)));
    soft('thumbnails generated', fs.existsSync(path.join(MEDIA, 'thumb', 'fall_01.jpg')));
    soft('review item carries thumb path', fall && /thumb\//.test(fall.media[0].thumb || ''));

    // REVIEW STEP: caption everything; promote SF photo onto Glacier Point (day 2 idx 1)
    review.stops.forEach(s => s.media.forEach(m => { m.caption = `Photo at ${s.stop}`; }));
    const sf = review.unmatched.find(u => u.src.includes('random_sf'));
    sf.day = 2; sf.stop_index = 1; sf.caption = 'Manually placed';
    fs.writeFileSync(REVIEW, yaml.dump(review));

    // APPLY + idempotency
    check('apply reports items applied', /Applied [1-9]\d* media/.test(tk(['media', 'apply', REVIEW, TRIP])));
    const after = yaml.load(fs.readFileSync(TRIP, 'utf8'));
    check('Lower Yosemite Fall has 2 media', (after.days[0].stops[0].media || []).length === 2);
    check('captions merged', after.days[0].stops[0].media[0].caption === 'Photo at Lower Yosemite Fall');
    check('promoted SF photo on Glacier Point', (after.days[1].stops[1].media || []).some(m => /random_sf/.test(m.src)));
    check('apply is idempotent', /Applied 0 media/.test(tk(['media', 'apply', REVIEW, TRIP])));

    // POST-TRIP: validate (no errors; far-GPS warning expected) + render
    const { errors, warnings } = validate(yaml.load(fs.readFileSync(TRIP, 'utf8')));
    check('post-trip has no validation errors', errors.length === 0, JSON.stringify(errors));
    check('post-trip warns on far manual placement', warnings.some(w => /media GPS is \d+ mi/.test(w.message)), JSON.stringify(warnings));
    tk([TRIP, path.join(work, 'post.html')]);
    const post = fs.readFileSync(path.join(work, 'post.html'), 'utf8');
    check('post render embeds media src', post.includes('fall_01.jpg'));
    check('post render embeds caption', post.includes('Photo at Lower Yosemite Fall'));

    console.log(failures === 0 ? '✓ media lifecycle e2e passed' : `✖ media lifecycle e2e: ${failures} assertion(s) failed`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
