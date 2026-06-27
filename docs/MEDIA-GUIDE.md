# TripKit Media Guide

Turn the photos and videos from a finished trip into an interactive map where every
stop shows what you actually captured there — and an optional, agent-assisted workflow
for captioning and fixing matches.

This guide covers:

1. [What you get](#what-you-get)
2. [Quick start](#quick-start)
3. [How matching works](#how-matching-works)
4. [The review file, field by field](#the-review-file-field-by-field)
5. [Letting an AI agent do the review](#letting-an-ai-agent-do-the-review)
6. [The `media` schema](#the-media-schema)
7. [Using URLs instead of local files](#using-urls-instead-of-local-files)
8. [Troubleshooting](#troubleshooting)
9. [Command reference](#command-reference)

---

## What you get

Once media is attached to a trip, the rendered HTML gains:

- **Per-stop galleries** — a thumbnail strip and a `📷 N` count badge on each stop card and map popup.
- **A marker cue** — stops with media show a `📷 N` badge on their map marker; click it to jump straight to the photos.
- **A full-screen lightbox** — arrow keys / swipe / click to navigate, `Esc` to close, inline video playback, with each item's caption and capture time/GPS.
- **A photo-pin layer** — a toggleable map layer (the **📷 Photos** button, top-right) that drops a pin at the exact GPS of every geotagged item, separate from the day-numbered stop markers.

Stops without media render exactly as before — everything here is additive and optional.

---

## Quick start

You need: a finished `trip.yaml` (the same file the renderer already uses) and a folder of
photos/videos from the trip. Photos with EXIF GPS + timestamps match automatically; others
can be placed by hand (or by an agent) in the review step.

```bash
# 1. Match your media folder to the trip's stops.
#    Writes trip.media-review.yaml — nothing in trip.yaml changes yet.
npx tripkit media ./my-photos trip.yaml

# 2. Open trip.media-review.yaml. Add captions, fix any wrong matches,
#    and place the items under "unmatched" that you want to keep.

# 3. Merge the reviewed media into the trip.
npx tripkit media apply trip.media-review.yaml trip.yaml

# 4. Re-render. The map now shows your photos.
npx tripkit trip.yaml trip.html
open trip.html
```

> Running from a git clone instead of npx? Use `node convert.js …` in place of `npx tripkit …`.

**Thumbnails (optional).** If [`sharp`](https://www.npmjs.com/package/sharp) is installed,
step 1 also writes downscaled thumbnails to `my-photos/thumb/` and references them for fast
map/gallery loading. If `sharp` isn't installed, the step still works — it just uses the
full-resolution images directly. Install with `npm install sharp` to enable thumbnails.

---

## How matching works

`tripkit media` reads each file's EXIF metadata and assigns it to a stop using two signals:

1. **Timestamp → day.** The photo's `DateTimeOriginal` is matched to the day whose `date`
   falls on the same calendar date. (The year comes from `trip.dates`.) This keeps a photo
   taken on Day 3 from matching a closer-looking stop on Day 5.
2. **GPS → nearest stop.** Within that day, the item is assigned to the geographically
   nearest stop (great-circle distance). The result is tagged with a `confidence`:
   - `high` — within ~3 miles of the stop.
   - `medium` — within ~25 miles.
   - Anything farther, or with **no GPS**, or whose date matches **no day**, goes to the
     `unmatched` bucket for you to handle.

Videos are routed to `unmatched` by default — most video formats don't expose GPS the way
photos do, so they're left for you to place rather than guessed at.

Nothing is destructive: matching only ever *proposes*. Your `trip.yaml` is untouched until
you run `media apply`.

---

## The review file, field by field

`tripkit media` writes `<trip>.media-review.yaml`. It's meant to be read and edited before
applying. A trimmed example:

```yaml
trip_file: trip.yaml
summary:
  total: 6              # files scanned
  with_gps: 5           # had EXIF GPS
  with_timestamp: 5     # had an EXIF capture time
  matched: 4            # confidently assigned to a stop
  unmatched: 2          # need your attention
  thumbnails: generated # or: "skipped (sharp not installed)"

stops:
  - day: 1              # ← which day (matches days[].number in trip.yaml)
    stop_index: 0       # ← which stop within that day (0-based)
    stop: Lower Yosemite Fall   # name, for your reference (not used on apply)
    media:
      - src: media/fall_01.jpg
        type: photo
        caption: ""               # ← WRITE THIS. Shown in the lightbox.
        thumb: media/thumb/fall_01.jpg
        lat: 37.7560              # original EXIF GPS (drives the photo-pin layer)
        lng: -119.5965
        taken_at: '2026-05-15T17:15:00Z'
        confidence: high          # advisory only; removed on apply

unmatched:
  - src: media/random_sf.jpg
    type: photo
    caption: ""
    lat: 37.7749
    lng: -122.4194
    taken_at: '2026-05-16T12:00:00Z'
    reason: nearest stop "Glacier Point" is 156 mi away   # why it wasn't auto-matched
    suggested_stop: Glacier Point
  - src: media/no_gps.jpg
    type: photo
    caption: ""
    reason: no GPS in EXIF
```

**What to edit:**

| Goal | Do this |
|------|---------|
| Add a caption | Fill in `caption:` (this is the highest-value edit — it's what the lightbox shows). |
| Move a photo to a different stop | Change its `day:` / `stop_index:` (under `stops:`), or move the item between entries. |
| Keep an unmatched item | Give it a `day:` and `stop_index:` — then it's applied like any matched item. |
| Drop an unmatched item | Leave it in `unmatched` without a `day`/`stop_index`. It's ignored on apply. |
| Remove a wrong match | Delete the item from the file before applying. |

**What's ignored on apply:** the `confidence`, `reason`, `suggested_stop`, and `stop` (name)
fields are review aids — they're stripped when merging into `trip.yaml`. Only
`src`, `type`, `thumb`, `caption`, `lat`, `lng`, and `taken_at` are written through.

**`media apply` is idempotent.** Re-running it won't duplicate items already present (it
matches on `src`), so it's safe to apply, render, tweak captions, and apply again.

---

## Letting an AI agent do the review

The review step — captioning every photo and placing the unmatched ones — is exactly the
kind of judgement work an AI agent is good at. The flow is designed so a human or an agent
can do it; the agent never touches your originals, only the review YAML.

A typical agent session:

> **You:** "I ran `tripkit media ./trip-photos yosemite.yaml`. Here's the review file —
> caption the photos and place the unmatched ones, then tell me the apply command."
>
> *(paste or share `yosemite.media-review.yaml`)*

The agent should:

1. **Caption each matched item** — concise, specific, grounded in what the photo shows and
   the stop it's at. "Lower Yosemite Fall roaring with May snowmelt," not "Photo 1."
   It can lean on `stop`, `taken_at`, and the trip's own descriptions for context.
2. **Resolve `unmatched` items** — use `suggested_stop`, the `reason`, the filename, the
   `taken_at` time, and the trip itinerary to decide a `day` + `stop_index`, or leave
   genuinely unplaceable items unmatched. A `reason: no GPS` selfie taken at 8pm on Day 2
   probably belongs at that day's dinner or lodging stop.
3. **Flag the suspicious ones** — if `suggested_stop` is 150 miles away, that photo likely
   isn't from a planned stop at all; better to leave it out than force a wrong pin.
4. **Hand back the edited review file** and the exact `tripkit media apply …` command.

If you use **Claude Code**, install the skill once and the agent already knows this flow
(it's Phase 5 of the TripKit agent skill):

```bash
npx tripkit install-skill      # → ~/.claude/skills/tripkit/
```

Then: *"Use the tripkit skill to caption and place the media in this review file."*

**Why review-in-the-middle?** The agent works on a separate YAML, not your photo files or
your trip. You see every proposed caption and placement before anything is written, and the
`media apply` step is a plain mechanical merge you run yourself. The intelligence is
auditable, not a black box.

After the agent returns the file, validate and render:

```bash
npx tripkit media apply yosemite.media-review.yaml yosemite.yaml
npx tripkit validate yosemite.yaml     # surfaces e.g. media GPS far from its stop
npx tripkit yosemite.yaml yosemite.html
```

---

## The `media` schema

Each stop (and, optionally, `lodging`) may carry a `media` array. It's purely additive to
the [existing schema](../schema/tripkit.schema.yaml).

```yaml
stops:
  - name: "Multnomah Falls"
    lat: 45.576
    lng: -122.116
    image: "https://…"        # unchanged: the single hero/primary image
    media:                    # the gallery
      - src: "media/IMG_2401.jpg"   # relative path OR full URL (required)
        type: photo                  # "photo" | "video"
        thumb: "media/thumb/IMG_2401.jpg"  # optional; renderer falls back to src
        caption: "620-ft waterfall from the lower viewpoint"  # optional
        lat: 45.5762                 # optional EXIF GPS; powers the photo-pin layer
        lng: -122.1158
        taken_at: "2026-04-07T14:32:00"    # optional ISO 8601 capture time
```

- `image` (the original single-image field) is untouched and still used as the hero/primary.
  `media` is the new gallery shown in cards, popups, the lightbox, and the marker badge.
- Only `src` and a valid `type` are required per item; everything else is optional.
- Items that include `lat`/`lng` also appear as individual pins on the **📷 Photos** map layer.

`tripkit validate` checks every media item has a `src` and a valid `type`, and **warns**
when an item's GPS is more than ~25 miles from its stop — a strong hint it was placed on the
wrong stop.

---

## Using URLs instead of local files

`src` (and `thumb`) accept either a **relative path** or a **full URL**.

- **Relative paths** (the default from `tripkit media`) keep full-resolution media, but the
  output is now an HTML file *plus* its media folder — ship them together.
- **URLs** (e.g. photos you've uploaded to S3, Cloudinary, Google Photos, or anywhere with a
  direct link) keep the output a **single, self-contained, shareable HTML file** with no
  media folder to carry around.

You can mix both in one trip. To use URLs, either point `src` at them when hand-editing the
review file, or swap the relative paths for URLs in `trip.yaml` after applying.

---

## Troubleshooting

**"Missing dependency exifr."** The ingest step needs it: `npm install exifr` (or just
`npm install` in a clone — it's a normal dependency). Only the `media` command needs it; the
renderer and `convert` don't.

**Thumbnails were skipped.** That's the `sharp`-not-installed path; it's fine. Run
`npm install sharp` to enable them. The review file's `summary.thumbnails` tells you which
path ran.

**Everything landed in `unmatched`.** Usually one of:
- The photos have no GPS (phone privacy settings, screenshots, exported/edited copies that
  stripped EXIF). Place them by hand using `day` + `stop_index`.
- The photo dates don't line up with any day's `date`, so the day filter excludes every
  stop. Check that `trip.dates` has the right year and each day's `date` is correct.

**A photo matched the wrong stop.** Edit its `day`/`stop_index` in the review file before
applying, or move it to the right `stops:` entry. If you already applied, fix it in
`trip.yaml` (the `media` array under that stop) and re-render.

**Videos didn't match.** Expected — they're routed to `unmatched` by default. Give them a
`day` + `stop_index` to place them; they play inline in the lightbox.

**The marker badge / photo-pin layer didn't appear.** The badge only shows on stops that
have `media`; the **📷 Photos** toggle only appears when at least one media item has its own
`lat`/`lng`. If your items lack GPS, the galleries and lightbox still work — just not the pins.

---

## Command reference

```text
tripkit media <folder> <trip.yaml>
    Scan <folder> for photos/videos, read EXIF GPS + timestamps, auto-match each
    to the nearest stop on the matching day, optionally generate thumbnails, and
    write <trip>.media-review.yaml. Does not modify <trip.yaml>.

tripkit media apply <review.yaml> <trip.yaml>
    Merge the reviewed media into <trip.yaml>'s stops[].media[]. Idempotent.

tripkit validate <trip.yaml>
    Validate the trip, including media (src present, type valid, GPS sanity).

tripkit <trip.yaml> [output.html]
    Render to interactive HTML (auto-validates first).
```

Supported media extensions: photos — `.jpg .jpeg .png .heic .heif .webp .tif .tiff`;
videos — `.mp4 .mov .m4v .avi .mkv .webm`.

See also: the [README](../README.md) for the project overview and the
[agent skill](../agent/SKILL.md) (Phase 5) for the agent-facing version of this flow.
