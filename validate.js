/**
 * TripKit YAML validator.
 *
 * Exports `validate(data)` returning { errors, warnings } — each is a list of
 * { path, message } objects. Errors block render; warnings are advisory.
 */

const STOP_TYPES = new Set(['hike', 'scenic', 'food', 'city', 'activity', 'beach', 'museum', 'shopping']);
const DAY_STATUS = new Set(['completed', 'active', 'upcoming']);
const MAP_STYLES = new Set(['terrain', 'satellite', 'topo', 'street']);
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isFiniteNumber(n) { return typeof n === 'number' && Number.isFinite(n); }
function isNonEmptyString(s) { return typeof s === 'string' && s.trim().length > 0; }

function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Renderer auto-generates routes by stitching: prev-lodging → stops → today's-lodging.
// Pick the same anchor the renderer would use for each end of a day's route.
function dayEndAnchor(d) {
  if (d.lodging && d.lodging.lat && d.lodging.lng && d.lodging.name !== 'Home') {
    return [d.lodging.lat, d.lodging.lng, 'lodging'];
  }
  const stops = (d.stops || []).filter(s => isFiniteNumber(s.lat) && isFiniteNumber(s.lng));
  if (stops.length > 0) {
    const last = stops[stops.length - 1];
    return [last.lat, last.lng, `stops[${stops.length - 1}]`];
  }
  return null;
}
function dayStartAnchor(d) {
  const stops = (d.stops || []).filter(s => isFiniteNumber(s.lat) && isFiniteNumber(s.lng));
  if (stops.length > 0) return [stops[0].lat, stops[0].lng, 'stops[0]'];
  if (d.lodging && d.lodging.lat && d.lodging.lng && d.lodging.name !== 'Home') {
    return [d.lodging.lat, d.lodging.lng, 'lodging'];
  }
  return null;
}

// Threshold above which a single straight-line polyline segment looks visually disjointed.
const LONG_LEG_MILES = 250;

function validate(data) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!data || typeof data !== 'object') {
    err('(root)', 'YAML did not parse to an object');
    return { errors, warnings };
  }

  // --- trip ---
  const trip = data.trip;
  if (!trip || typeof trip !== 'object') {
    err('trip', 'missing trip metadata block');
  } else {
    if (!isNonEmptyString(trip.title)) err('trip.title', 'required, non-empty string');
    if (trip.total_days != null && !Number.isInteger(trip.total_days)) {
      err('trip.total_days', `must be an integer, got ${typeof trip.total_days}`);
    }
    if (trip.total_stops != null && !Number.isInteger(trip.total_stops)) {
      err('trip.total_stops', `must be an integer, got ${typeof trip.total_stops}`);
    }
    const checkLatLng = (latKey, lngKey) => {
      const lat = trip[latKey];
      const lng = trip[lngKey];
      if (lat != null && (!isFiniteNumber(lat) || lat < -90 || lat > 90)) {
        err(`trip.${latKey}`, `must be a number in [-90, 90]; got ${lat}`);
      }
      if (lng != null && (!isFiniteNumber(lng) || lng < -180 || lng > 180)) {
        err(`trip.${lngKey}`, `must be a number in [-180, 180]; got ${lng}`);
      }
      if ((lat != null) !== (lng != null)) {
        err(`trip.${latKey}`, `both ${latKey} and ${lngKey} must be set together`);
      }
    };
    checkLatLng('origin_lat', 'origin_lng');
    checkLatLng('destination_lat', 'destination_lng');
  }

  // --- days ---
  const days = data.days;
  if (!Array.isArray(days) || days.length === 0) {
    err('days', 'must be a non-empty array');
    return { errors, warnings };
  }

  let actualStops = 0;
  days.forEach((d, di) => {
    const dp = `days[${di}]`;
    if (!d || typeof d !== 'object') {
      err(dp, 'must be an object');
      return;
    }
    if (!Number.isInteger(d.number)) err(`${dp}.number`, 'required integer');
    else if (d.number !== di + 1) warn(`${dp}.number`, `expected ${di + 1} (sequential), got ${d.number}`);
    if (!isNonEmptyString(d.title)) err(`${dp}.title`, 'required, non-empty string');
    if (!isNonEmptyString(d.date)) err(`${dp}.date`, 'required, non-empty string');
    if (d.status != null && !DAY_STATUS.has(d.status)) {
      err(`${dp}.status`, `must be one of ${[...DAY_STATUS].join(', ')}; got "${d.status}"`);
    }
    if (d.color != null && !HEX.test(d.color)) {
      err(`${dp}.color`, `must be a hex color (#abc or #aabbcc); got "${d.color}"`);
    }

    // stops
    if (d.stops != null) {
      if (!Array.isArray(d.stops)) {
        err(`${dp}.stops`, 'must be an array');
      } else {
        d.stops.forEach((s, si) => {
          const sp = `${dp}.stops[${si}]`;
          actualStops++;
          if (!s || typeof s !== 'object') { err(sp, 'must be an object'); return; }
          if (!isNonEmptyString(s.name)) err(`${sp}.name`, 'required, non-empty string');
          if (!isFiniteNumber(s.lat)) err(`${sp}.lat`, 'required finite number');
          else if (s.lat < -90 || s.lat > 90) err(`${sp}.lat`, `out of range [-90, 90]: ${s.lat}`);
          if (!isFiniteNumber(s.lng)) err(`${sp}.lng`, 'required finite number');
          else if (s.lng < -180 || s.lng > 180) err(`${sp}.lng`, `out of range [-180, 180]: ${s.lng}`);
          if (s.type != null && !STOP_TYPES.has(s.type)) {
            err(`${sp}.type`, `must be one of ${[...STOP_TYPES].join(', ')}; got "${s.type}"`);
          }
          if (s.kid_friendly != null && typeof s.kid_friendly !== 'boolean') {
            err(`${sp}.kid_friendly`, 'must be boolean');
          }
        });
      }
    }

    // lodging
    if (d.lodging && typeof d.lodging === 'object') {
      const lp = `${dp}.lodging`;
      const { lat, lng } = d.lodging;
      if (lat != null && (!isFiniteNumber(lat) || lat < -90 || lat > 90)) {
        err(`${lp}.lat`, `must be a number in [-90, 90]; got ${lat}`);
      }
      if (lng != null && (!isFiniteNumber(lng) || lng < -180 || lng > 180)) {
        err(`${lp}.lng`, `must be a number in [-180, 180]; got ${lng}`);
      }
      if (d.lodging.booked != null && typeof d.lodging.booked !== 'boolean') {
        err(`${lp}.booked`, 'must be boolean');
      }
      const isHome = d.lodging.name === 'Home';
      if (d.lodging.booked && !isHome && !isNonEmptyString(d.lodging.confirmation)) {
        warn(`${lp}.confirmation`, 'lodging is marked booked but confirmation is empty');
      }
    }
  });

  // --- cross-check totals ---
  if (trip && Number.isInteger(trip.total_days) && trip.total_days !== days.length) {
    warn('trip.total_days', `declared ${trip.total_days}, actual days = ${days.length}`);
  }
  if (trip && Number.isInteger(trip.total_stops) && trip.total_stops !== actualStops) {
    warn('trip.total_stops', `declared ${trip.total_stops}, actual stops = ${actualStops}`);
  }

  // --- continuity check: warn on long inter-day jumps with no intermediate waypoint ---
  if (data.routes == null) {
    for (let i = 0; i + 1 < days.length; i++) {
      const fromAnchor = dayEndAnchor(days[i]);
      const toDay = days[i + 1];
      const stops = (toDay.stops || []).filter(s => isFiniteNumber(s.lat) && isFiniteNumber(s.lng));
      const toAnchor = stops.length > 0 ? [stops[0].lat, stops[0].lng] : dayStartAnchor(toDay);
      if (!fromAnchor || !toAnchor) continue;
      const miles = distanceMiles(fromAnchor[0], fromAnchor[1], toAnchor[0], toAnchor[1]);
      if (miles > LONG_LEG_MILES) {
        warn(`days[${i + 1}].stops`, `first stop is ${Math.round(miles)} mi from end of day ${i + 1} — auto-generated polyline will draw a long straight line. Add an intermediate stop or define a routes[] entry.`);
      }
    }
  }

  // --- routes (optional) ---
  if (data.routes != null) {
    if (!Array.isArray(data.routes)) {
      err('routes', 'must be an array when present');
    } else {
      data.routes.forEach((r, ri) => {
        const rp = `routes[${ri}]`;
        if (!Number.isInteger(r.day)) err(`${rp}.day`, 'required integer');
        else if (r.day < 1 || r.day > days.length) {
          err(`${rp}.day`, `references day ${r.day}, but only ${days.length} days exist`);
        }
        if (r.color != null && !HEX.test(r.color)) err(`${rp}.color`, `must be hex; got "${r.color}"`);
        if (!Array.isArray(r.points) || r.points.length < 2) {
          err(`${rp}.points`, 'must be an array of at least 2 [lat, lng] pairs');
        } else {
          r.points.forEach((pt, pi) => {
            if (!Array.isArray(pt) || pt.length !== 2 || !isFiniteNumber(pt[0]) || !isFiniteNumber(pt[1])) {
              err(`${rp}.points[${pi}]`, 'must be [lat, lng] number pair');
            }
          });
        }
      });
    }
  }

  // --- theme (optional) ---
  if (data.theme && typeof data.theme === 'object') {
    if (data.theme.accent_color != null && !HEX.test(data.theme.accent_color)) {
      err('theme.accent_color', `must be hex; got "${data.theme.accent_color}"`);
    }
    if (data.theme.dark_mode != null && typeof data.theme.dark_mode !== 'boolean') {
      err('theme.dark_mode', 'must be boolean');
    }
    if (data.theme.map_style != null && !MAP_STYLES.has(data.theme.map_style)) {
      err('theme.map_style', `must be one of ${[...MAP_STYLES].join(', ')}; got "${data.theme.map_style}"`);
    }
    if (data.theme.hotel_label != null && (typeof data.theme.hotel_label !== 'string' || data.theme.hotel_label.length === 0 || data.theme.hotel_label.length > 4)) {
      err('theme.hotel_label', 'must be a string of 1–4 characters (used as the hotel marker label)');
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
