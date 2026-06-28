import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import type { Trip, NarrationEntry, FlatStop } from './types.js';

export function readTrip(path: string): Trip {
  const data = yaml.load(readFileSync(path, 'utf8')) as Trip;
  if (!data || !Array.isArray(data.days)) {
    throw new Error(`Not a valid trip file (no days[]): ${path}`);
  }
  return data;
}

export function readNarration(path: string): NarrationEntry[] {
  if (!existsSync(path)) return [];
  const data = yaml.load(readFileSync(path, 'utf8')) as { stops?: NarrationEntry[] } | NarrationEntry[];
  const list = Array.isArray(data) ? data : data?.stops ?? [];
  return list.filter((e) => Number.isInteger(e.day) && Number.isInteger(e.stop_index));
}

function isFinitePair(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

export function flattenStops(trip: Trip): FlatStop[] {
  const out: FlatStop[] = [];
  for (const day of trip.days || []) {
    (day.stops || []).forEach((stop, stopIndex) => {
      if (!isFinitePair(stop.lat, stop.lng)) return;
      out.push({ day: day.number, stopIndex, dayColor: day.color || '#666666', stop });
    });
  }
  return out;
}
