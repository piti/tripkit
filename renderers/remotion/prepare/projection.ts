export const TILE_SIZE = 256;
export const MAX_LAT = 85.05112878;

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

export function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const size = worldSize(zoom);
  const x = ((lng + 180) / 360) * size;
  const sin = Math.sin((clamped * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return { x, y };
}

export function latLngToPixel(
  lat: number,
  lng: number,
  zoom: number,
  origin: { x: number; y: number }
): { x: number; y: number } {
  const w = latLngToWorld(lat, lng, zoom);
  return { x: w.x - origin.x, y: w.y - origin.y };
}
