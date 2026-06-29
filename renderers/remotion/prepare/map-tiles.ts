import StaticMaps from 'staticmaps';
import { latLngToWorld, worldSize, MAX_LAT } from './projection.js';
import type { TileProvider } from './adapters/tiles.js';

export interface SegmentView {
  zoom: number;
  origin: { x: number; y: number };
  width: number;
  height: number;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 16;

// Pick the highest zoom at which both points (plus padding) fit in width×height.
export function computeSegmentView(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number },
  opts: { width: number; height: number; padding?: number }
): SegmentView {
  const pad = opts.padding ?? 0.35; // fraction of frame kept as margin
  const pts = from ? [from, to] : [to];
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
    const worlds = pts.map((p) => latLngToWorld(p.lat, p.lng, zoom));
    const minX = Math.min(...worlds.map((w) => w.x));
    const maxX = Math.max(...worlds.map((w) => w.x));
    const minY = Math.min(...worlds.map((w) => w.y));
    const maxY = Math.max(...worlds.map((w) => w.y));
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (spanX <= opts.width * (1 - pad) && spanY <= opts.height * (1 - pad)) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return {
        zoom,
        origin: { x: cx - opts.width / 2, y: cy - opts.height / 2 },
        width: opts.width,
        height: opts.height,
      };
    }
  }
  // Fall back to MIN_ZOOM centered on `to`.
  const w = latLngToWorld(to.lat, to.lng, MIN_ZOOM);
  return {
    zoom: MIN_ZOOM,
    origin: { x: w.x - opts.width / 2, y: w.y - opts.height / 2 },
    width: opts.width,
    height: opts.height,
  };
}

// Pick the highest zoom at which ALL points (plus padding) fit — used for the
// opening hero map that shows the whole trip route at once.
export function computeFullView(
  points: { lat: number; lng: number }[],
  opts: { width: number; height: number; padding?: number }
): SegmentView {
  const pad = opts.padding ?? 0.35;
  const pts = points.length ? points : [{ lat: 0, lng: 0 }];
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
    const worlds = pts.map((p) => latLngToWorld(p.lat, p.lng, zoom));
    const minX = Math.min(...worlds.map((w) => w.x));
    const maxX = Math.max(...worlds.map((w) => w.x));
    const minY = Math.min(...worlds.map((w) => w.y));
    const maxY = Math.max(...worlds.map((w) => w.y));
    if (maxX - minX <= opts.width * (1 - pad) && maxY - minY <= opts.height * (1 - pad)) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return { zoom, origin: { x: cx - opts.width / 2, y: cy - opts.height / 2 }, width: opts.width, height: opts.height };
    }
  }
  const w = latLngToWorld(pts[0].lat, pts[0].lng, MIN_ZOOM);
  return { zoom: MIN_ZOOM, origin: { x: w.x - opts.width / 2, y: w.y - opts.height / 2 }, width: opts.width, height: opts.height };
}

export function projectRoute(
  points: { lat: number; lng: number }[],
  zoom: number,
  origin: { x: number; y: number }
): { x: number; y: number }[] {
  return points.map((p) => {
    const w = latLngToWorld(p.lat, p.lng, zoom);
    return { x: w.x - origin.x, y: w.y - origin.y };
  });
}

// Center lat/lng of a view, for staticmaps which centers by lat/lng+zoom.
function viewCenterLatLng(view: SegmentView): { lat: number; lng: number } {
  const size = worldSize(view.zoom);
  const cx = view.origin.x + view.width / 2;
  const cy = view.origin.y + view.height / 2;
  const lng = (cx / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * cy) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)), lng };
}

export async function stitchMap(view: SegmentView, provider: TileProvider, outPath: string): Promise<void> {
  const map = new StaticMaps({
    width: view.width,
    height: view.height,
    tileUrl: provider.urlTemplate,
    tileSize: 256,
  });
  const center = viewCenterLatLng(view);
  await map.render([center.lng, center.lat], view.zoom);
  await map.image.save(outPath);
}
