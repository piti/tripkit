# TripKit Video Renderer (Remotion)

Turn a media-populated `trip.yaml` into a narrated trip-recap MP4 — a map that
flies between stops drawing the route, photo montages, title cards, subtitles,
music, and optional first-person narration.

> **Opt-in & heavy.** This is a separate package from core `tripkit`. It pulls in
> Remotion, React, a headless-Chrome build, and ffmpeg. Install only if you want video.

## Setup

```bash
cd renderers/remotion
npm install
export MAPTILER_KEY=…        # free key from https://maptiler.com (default tiles)
# or render non-commercially with --tiles esri (no key; Esri attribution shown)
```

## Make a video

```bash
# 1. (optional) scaffold narration, then rewrite each script in first-person
npm run narrate -- ../../my-trip.yaml
#    → my-trip.narration.yaml — hand to an AI agent or edit yourself

# 2. render
npm run video -- ../../my-trip.yaml out.mp4                 # captions + default music
npm run video -- ../../my-trip.yaml out.mp4 --narrate       # + TTS narration + subtitles
npm run video -- ../../my-trip.yaml out.mp4 --music track.mp3
npm run video -- ../../my-trip.yaml out.mp4 --music ai --narrate
```

Flags: `--narrate` (needs `TRIPKIT_TTS_KEY`), `--music <file|ai>` (`ai` needs
`TRIPKIT_MUSIC_KEY`), `--tiles <maptiler|esri>`.

## Licensing

- **Remotion** is free for individuals, non-profits, and companies with ≤3
  employees; 4+ employees need a paid Remotion Company License (remotion.pro).
- **Map tiles in distributed video:** use **MapTiler** (default) or another
  provider whose terms permit rendered/exported media, with attribution shown
  on-screen. **Esri** public tiles (`--tiles esri`) are **non-commercial only** —
  don't monetize Esri-tiled output.
- Replace `assets/music/default.mp3` with a real royalty-free track before
  distributing (the committed file is a placeholder).
