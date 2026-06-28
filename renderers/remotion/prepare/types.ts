export interface MediaItem {
  src: string;
  type: 'photo' | 'video';
  thumb?: string;
  caption?: string;
  lat?: number;
  lng?: number;
  taken_at?: string;
}
export interface Stop {
  name: string;
  lat: number;
  lng: number;
  type?: string;
  label?: string;
  description?: string;
  media?: MediaItem[];
}
export interface Day {
  number: number;
  title: string;
  date: string;
  color?: string;
  stops: Stop[];
  lodging?: { name: string; lat?: number; lng?: number };
}
export interface Trip {
  trip: {
    title: string;
    subtitle?: string;
    dates?: string;
    origin?: string;
    origin_lat?: number;
    origin_lng?: number;
    destination_lat?: number;
    destination_lng?: number;
    travelers?: { adults?: number; children?: number };
    agent_context?: { iteration_log?: { date: string; change: string }[] };
  };
  days: Day[];
}
export interface NarrationEntry {
  day: number;
  stop_index: number;
  stop: string;
  script: string;
}
export interface FlatStop {
  day: number;
  stopIndex: number;
  dayColor: string;
  stop: Stop;
}

// Props consumed by the Remotion composition (output of the prepare stage).
export interface CaptionToken { text: string; fromMs: number; toMs: number; }
export interface SegmentProps {
  day: number;
  stopIndex: number;
  title: string;       // stop name
  dayTitle: string;
  date: string;
  dayColor: string;
  description: string;
  mapImage: string;            // relative path into assets/generated
  mapWidth: number;
  mapHeight: number;
  fromPx: { x: number; y: number } | null;   // previous stop pixel (camera start)
  toPx: { x: number; y: number };             // this stop pixel (camera end)
  routePx: { x: number; y: number }[];        // polyline in map-image pixels
  photos: string[];            // resolved photo srcs/urls
  narrationAudio: string | null;
  narrationSeconds: number | null;
  captions: CaptionToken[];
  durationInFrames: number;
}
export interface VideoProps {
  title: string;
  subtitle: string;
  fps: number;
  width: number;
  height: number;
  music: string | null;
  attribution: string;
  segments: SegmentProps[];
}
