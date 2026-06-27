/**
 * TripKit media ingest.
 *
 * Turns a folder of geotagged photos/videos from a completed trip into per-stop
 * `media[]` entries on a trip YAML. Two-step, review-in-the-middle flow:
 *
 *   1) build:  scan a folder, read EXIF GPS + timestamp, auto-match each item to
 *              the nearest stop within the matching day, and write a review file
 *              (`<trip>.media-review.yaml`). Low-confidence / geotag-less / undated
 *              items land in an `unmatched:` bucket. This file is the AI-assist /
 *              human handoff: edit captions, fix matches, then apply.
 *   2) apply:  merge the reviewed items back into the trip YAML's stops[].media[].
 *
 * Dependencies:
 *   - exifr  (required for build) — EXIF GPS/timestamp extraction.
 *   - sharp  (optional)          — thumbnail generation; skipped gracefully if absent.
 *
 * Exported entry points are driven by convert.js's `media` subcommand.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm']);

// Distance (miles) within which a photo is confidently the same place as a stop.
const NEAR_MILES = 3;
// Distance above which we don't trust the auto-match — route to `unmatched` for review.
const FAR_MILES = 25;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
};

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function extOf(file) { return path.extname(file).toLowerCase(); }
function mediaType(file) {
  const e = extOf(file);
  if (PHOTO_EXT.has(e)) return 'photo';
  if (VIDEO_EXT.has(e)) return 'video';
  return null;
}

// Recursively collect supported media files under a folder (skips a "thumb" subdir).
function scanMedia(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'thumb') continue;
      out.push(...scanMedia(full));
    } else if (mediaType(entry.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

// Parse a day's free-form `date` (e.g. "Saturday, April 6") into {month, day},
// pulling the year from trip.dates (e.g. "April 4–9, 2026"). Returns a YYYY-MM-DD
// string or null if it can't be parsed (matching then falls back to GPS-only).
function dayCalendarDate(dayDateStr, year) {
  if (typeof dayDateStr !== 'string') return null;
  const m = dayDateStr.toLowerCase().match(/([a-z]+)\s+(\d{1,2})/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  const day = parseInt(m[2], 10);
  if (month == null || !Number.isFinite(day)) return null;
  const y = year || new Date().getUTCFullYear();
  return `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function yearFromTrip(trip) {
  const src = (trip && (trip.dates || '')) + '';
  const m = src.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

// Build a lookup of YYYY-MM-DD -> day index, when day dates are parseable.
function buildDayDateIndex(data) {
  const year = yearFromTrip(data.trip);
  const index = new Map();
  (data.days || []).forEach((d, di) => {
    const cal = dayCalendarDate(d.date, year);
    if (cal) index.set(cal, di);
  });
  return index;
}

function takenDateKey(takenAt) {
  if (!takenAt) return null;
  // takenAt may be a Date (from exifr) or an ISO-ish string.
  const iso = takenAt instanceof Date ? takenAt.toISOString() : String(takenAt);
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Flatten stops across all days into a single list with day context.
function allStops(data) {
  const stops = [];
  (data.days || []).forEach((d, di) => {
    (d.stops || []).forEach((s, si) => {
      if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
        stops.push({ di, si, name: s.name, lat: s.lat, lng: s.lng });
      }
    });
  });
  return stops;
}

// Find the nearest stop to a coordinate, optionally restricted to one day.
function nearestStop(stops, lat, lng, restrictDi) {
  let best = null;
  for (const s of stops) {
    if (restrictDi != null && s.di !== restrictDi) continue;
    const miles = haversineMiles(lat, lng, s.lat, s.lng);
    if (!best || miles < best.miles) best = { ...s, miles };
  }
  return best;
}

// Try to load exifr; give a clear, actionable error if it's missing.
function loadExifr() {
  try {
    return require('exifr');
  } catch (e) {
    return null;
  }
}

// Try to load sharp for thumbnails; null means "skip thumbnails gracefully".
function loadSharp() {
  try {
    return require('sharp');
  } catch (e) {
    return null;
  }
}

async function extractExif(exifr, file) {
  if (mediaType(file) === 'video') {
    // exifr targets images; most video GPS lives in container metadata it can't read.
    // Route videos through review (no GPS/time) rather than guessing.
    return { lat: null, lng: null, takenAt: null };
  }
  try {
    const gps = await exifr.gps(file).catch(() => null);
    let takenAt = null;
    try {
      const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      takenAt = (meta && (meta.DateTimeOriginal || meta.CreateDate)) || null;
    } catch (_) { /* ignore */ }
    return {
      lat: gps && Number.isFinite(gps.latitude) ? gps.latitude : null,
      lng: gps && Number.isFinite(gps.longitude) ? gps.longitude : null,
      takenAt
    };
  } catch (e) {
    return { lat: null, lng: null, takenAt: null };
  }
}

function isoOrNull(takenAt) {
  if (!takenAt) return null;
  if (takenAt instanceof Date) return takenAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return String(takenAt);
}

// Produce a thumbnail next to the media in a `thumb/` subfolder. Returns the
// thumb path (relative to the media folder root) or null on failure/skip.
async function makeThumb(sharp, file, mediaRoot) {
  if (!sharp || mediaType(file) !== 'photo') return null;
  try {
    const thumbDir = path.join(mediaRoot, 'thumb');
    fs.mkdirSync(thumbDir, { recursive: true });
    const base = path.basename(file, path.extname(file)) + '.jpg';
    const thumbAbs = path.join(thumbDir, base);
    await sharp(file).rotate().resize(480, 360, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(thumbAbs);
    return path.join('thumb', base);
  } catch (e) {
    return null;
  }
}

/**
 * BUILD: scan a media folder and emit a review file.
 *
 * @param {string} folder      media folder to scan
 * @param {string} tripFile    path to the trip YAML (read-only here)
 * @param {object} io          { log, warn, c } reporting helpers from convert.js
 * @returns {Promise<string>}  path to the written review file
 */
async function buildReview(folder, tripFile, io) {
  const { log, warn, c } = io;
  const exifr = loadExifr();
  if (!exifr) {
    throw new Error('Missing dependency "exifr" (required for media ingest). Run: npm install exifr');
  }
  const sharp = loadSharp();
  if (!sharp) {
    warn('sharp not installed — skipping thumbnail generation (full-res images will be used). Run "npm install sharp" to enable thumbnails.');
  }

  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(`Media folder not found: ${folder}`);
  }
  const data = yaml.load(fs.readFileSync(tripFile, 'utf8'));
  if (!data || !Array.isArray(data.days)) {
    throw new Error(`Trip file has no days[]: ${tripFile}`);
  }

  const files = scanMedia(folder);
  if (files.length === 0) {
    throw new Error(`No supported media files found in ${folder}`);
  }
  log(`Scanning ${files.length} media file${files.length === 1 ? '' : 's'} in ${folder}…`);

  const stops = allStops(data);
  const dayIndex = buildDayDateIndex(data);
  // src paths in the YAML are stored relative to the trip file's directory.
  const tripDir = path.dirname(path.resolve(tripFile));

  const matched = []; // { di, si, item }
  const unmatched = [];
  let withGps = 0, withTime = 0;

  for (const file of files) {
    const { lat, lng, takenAt } = await extractExif(exifr, file);
    if (Number.isFinite(lat) && Number.isFinite(lng)) withGps++;
    if (takenAt) withTime++;

    const thumbRel = await makeThumb(sharp, file, folder);
    const srcRel = path.relative(tripDir, path.resolve(file)) || path.basename(file);
    const thumbSrc = thumbRel ? path.relative(tripDir, path.resolve(path.join(folder, thumbRel))) : null;

    const item = {
      src: srcRel.split(path.sep).join('/'),
      type: mediaType(file),
      caption: '',
    };
    if (thumbSrc) item.thumb = thumbSrc.split(path.sep).join('/');
    if (Number.isFinite(lat) && Number.isFinite(lng)) { item.lat = round6(lat); item.lng = round6(lng); }
    const iso = isoOrNull(takenAt);
    if (iso) item.taken_at = iso;

    // Restrict the nearest-stop search to the matching day when we can date the photo.
    const dayKey = takenDateKey(takenAt);
    const restrictDi = dayKey != null && dayIndex.has(dayKey) ? dayIndex.get(dayKey) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      unmatched.push({ ...item, reason: 'no GPS in EXIF' });
      continue;
    }
    const near = nearestStop(stops, lat, lng, restrictDi);
    if (!near) {
      unmatched.push({ ...item, reason: restrictDi != null ? 'no stops on matched day' : 'no stops with coordinates' });
      continue;
    }
    if (near.miles > FAR_MILES) {
      unmatched.push({ ...item, reason: `nearest stop "${near.name}" is ${Math.round(near.miles)} mi away`, suggested_stop: near.name });
      continue;
    }
    item.confidence = near.miles <= NEAR_MILES ? 'high' : 'medium';
    matched.push({ di: near.di, si: near.si, stop: near.name, day: data.days[near.di].number, item });
  }

  // Group matched items by stop for a readable review file.
  const byStop = new Map();
  for (const m of matched) {
    const key = `${m.di}:${m.si}`;
    if (!byStop.has(key)) byStop.set(key, { day: m.day, stop: m.stop, di: m.di, si: m.si, media: [] });
    byStop.get(key).media.push(m.item);
  }

  const review = {
    _instructions: [
      'Review auto-matched media below, then run: tripkit media apply <this-file> <trip.yaml>',
      'Each entry targets a stop by (day, stop_index). Edit `caption`, fix the stop_index,',
      'or move items between stops/unmatched as needed. Items in `unmatched` are ignored',
      'on apply until you give them a `day` and `stop_index`.'
    ],
    trip_file: path.relative(tripDir, path.resolve(tripFile)).split(path.sep).join('/') || path.basename(tripFile),
    summary: {
      total: files.length,
      with_gps: withGps,
      with_timestamp: withTime,
      matched: matched.length,
      unmatched: unmatched.length,
      thumbnails: sharp ? 'generated' : 'skipped (sharp not installed)'
    },
    stops: Array.from(byStop.values()).map(g => ({
      day: g.day,
      stop_index: g.si,
      stop: g.stop,
      media: g.media
    })),
    unmatched
  };

  const reviewPath = tripFile.replace(/\.ya?ml$/i, '') + '.media-review.yaml';
  fs.writeFileSync(reviewPath, yaml.dump(review, { lineWidth: 100, noRefs: true }), 'utf8');

  log(`${c.green('✓')} Matched ${matched.length}/${files.length} to stops; ${unmatched.length} need review.`);
  log(`  ${withGps} had GPS, ${withTime} had a timestamp.`);
  log(`Wrote ${c.bold(reviewPath)}`);
  log(c.dim('  Edit captions / fix matches, then: ') + `tripkit media apply ${path.basename(reviewPath)} ${path.basename(tripFile)}`);
  return reviewPath;
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

// Strip review-only bookkeeping fields before writing into the trip YAML.
function cleanItem(item) {
  const out = {};
  if (item.src) out.src = item.src;
  if (item.type) out.type = item.type;
  if (item.thumb) out.thumb = item.thumb;
  if (item.caption) out.caption = item.caption;
  if (Number.isFinite(item.lat)) out.lat = item.lat;
  if (Number.isFinite(item.lng)) out.lng = item.lng;
  if (item.taken_at) out.taken_at = item.taken_at;
  return out;
}

/**
 * APPLY: merge a reviewed media file into a trip YAML's stops[].media[].
 *
 * @param {string} reviewFile  path to the *.media-review.yaml
 * @param {string} tripFile    path to the trip YAML to update in place
 * @param {object} io          { log, warn, c }
 * @returns {Promise<void>}
 */
async function applyReview(reviewFile, tripFile, io) {
  const { log, warn, c } = io;
  const review = yaml.load(fs.readFileSync(reviewFile, 'utf8'));
  const data = yaml.load(fs.readFileSync(tripFile, 'utf8'));
  if (!data || !Array.isArray(data.days)) throw new Error(`Trip file has no days[]: ${tripFile}`);

  const dayByNumber = new Map();
  data.days.forEach((d, di) => { if (Number.isInteger(d.number)) dayByNumber.set(d.number, di); });

  let applied = 0, skipped = 0;
  const targets = [];
  for (const entry of (review.stops || [])) targets.push(entry);
  // Allow promoting unmatched items by giving them day + stop_index in the review file.
  for (const u of (review.unmatched || [])) {
    if (Number.isInteger(u.day) && Number.isInteger(u.stop_index)) {
      targets.push({ day: u.day, stop_index: u.stop_index, media: [u] });
    } else {
      skipped++;
    }
  }

  for (const entry of targets) {
    const di = dayByNumber.has(entry.day) ? dayByNumber.get(entry.day) : null;
    if (di == null) { warn(`No day numbered ${entry.day} — skipping ${(entry.media || []).length} item(s).`); skipped += (entry.media || []).length; continue; }
    const day = data.days[di];
    const stop = (day.stops || [])[entry.stop_index];
    if (!stop) { warn(`Day ${entry.day} has no stop_index ${entry.stop_index} — skipping.`); skipped += (entry.media || []).length; continue; }
    if (!Array.isArray(stop.media)) stop.media = [];
    const existing = new Set(stop.media.map(m => m.src));
    for (const raw of (entry.media || [])) {
      const item = cleanItem(raw);
      if (!item.src) { skipped++; continue; }
      if (existing.has(item.src)) continue; // idempotent re-apply
      stop.media.push(item);
      existing.add(item.src);
      applied++;
    }
  }

  fs.writeFileSync(tripFile, yaml.dump(data, { lineWidth: 100, noRefs: true }), 'utf8');
  log(`${c.green('✓')} Applied ${applied} media item${applied === 1 ? '' : 's'} into ${c.bold(tripFile)}${skipped ? c.dim(` (${skipped} skipped)`) : ''}`);
}

module.exports = { buildReview, applyReview };
