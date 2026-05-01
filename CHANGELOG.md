# Changelog

All notable changes to TripKit are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added
- GitHub Actions CI: runs `npm test` (validator + skill-coverage gate) and validates every YAML in `examples/` on Node 18/20/22 for every push and PR to `main`.
- **Claude Code skill bundle.** `agent/SKILL.md` now ships with `name`/`description` YAML frontmatter so it discovers as a proper Claude Code skill. New `npx tripkit install-skill` command copies the skill to `~/.claude/skills/tripkit/` (or `--project` for `.claude/skills/`); after install, invoke with `/skills tripkit`.
- **Dark mode.** `theme.dark_mode: true` now applies a `data-theme="dark"` attribute to the document and overrides the full color system: warm near-black background, lifted accent green, translucent callout tints, dark Leaflet popups. Stop badges, callouts, and chrome all theme automatically.
- **Day-status visual treatment.** The `status: completed | active | upcoming` field on each day is now reflected in the day-nav: completed days are muted, the day flagged `active` (today) gets a small accent dot. Selecting a muted day still highlights it fully.

### Changed
- Renamed `agent/AGENT-SKILL.md` → `agent/SKILL.md` to match Claude Code's skill convention. The body is unchanged and still agent-agnostic; the new frontmatter is ignored by non-Claude tooling.
- Renderer color system refactored to CSS variables. Stop badge colors, callout backgrounds, and shadows are all theme-aware via `--b-*-bg/fg`, `--*-soft`, and `--shadow*` variables — single source of truth for both light and dark modes.
- Stop cards lift on hover (subtle shadow + 1px translate) for a more tactile feel.
- Removed unused `--coral` variable (was a duplicate of `--warn`).

## [1.2.0] — 2026-04-30

### Added
- **`tripkit validate <trip.yaml>`** — schema validator that checks required fields, lat/lng ranges, valid stop types, hex colors, day numbering (sequential, status enum), `trip.total_days` / `trip.total_stops` consistency, optional routes structure, and theme fields. Warnings are advisory; errors block render. Pre-render validation is automatic; pass `--no-validate` to bypass. Includes a warning when any consecutive-day jump (Day N's lodging-or-last-stop → Day N+1's first stop) exceeds 250 mi without an explicit `routes[]` entry.
- **Origin / destination pins.** New optional schema fields `trip.origin_lat`, `trip.origin_lng`, `trip.destination_lat`, `trip.destination_lng`. When set, the renderer draws a green "A" Start pin and (for one-way trips) a red "B" End pin. For round trips, omit the destination fields. Without these, the trip's start/end was previously invisible — polylines just terminated in empty space.
- `theme.hotel_label` — optional 1–4 char string overriding the auto-derived hotel marker label. Falls back to first 3 chars of `agent_context.preferences.accommodation_chain`, then 🏨.
- Three new example trips: `southwest-parks-2026.yaml` (5-day UT/AZ parks loop, Zion/Bryce/Page/Grand Canyon), `nyc-long-weekend-2026.yaml` (3-day fly-in city break, single Marriott, no driving — exercises `museum`/`city`/`food`/`shopping`), `new-england-fall-2026.yaml` (5-day VT/NH foliage loop, regional inns, serif theme).
- Mobile polish at iPhone widths (≤480px): collapsible map legend (tap to expand), tighter day-nav, smaller hero, repositioned map controls. No regression at desktop or tablet.
- **Skill drift check.** `scripts/check-skill-coverage.js` enumerates 44 renderer-meaningful schema fields and asserts every one is mentioned in `agent/AGENT-SKILL.md`. Wired into `npm test` so future schema additions can't ship without updating the agent skill.

### Fixed
- **Disjointed inter-day routes.** When auto-generating route polylines (no explicit `routes[]` defined), each day's segment is now anchored to the previous day's lodging at the start and today's lodging at the end. Day N's polyline runs `prev-lodging → stops → today-lodging` and Day N+1 starts from the same point — the trip reads as one continuous chain instead of disconnected per-day segments.
- Duplicate hotel markers when one hotel covers multiple consecutive nights (visible in NYC's 3-night Marriott stay). Markers are now deduped by lat/lng, popups show "Nights X–Y · {first date} – {last date}", legend count reflects unique hotels.
- "Full route" bounds now include hotels and origin/destination pins, not just stops. Previously the Vegas start pin on the Southwest trip was off-screen on initial load.
- CSS cascade bug: mobile media query was placed before base `.legend` rules, so overrides silently lost the cascade. Moved to end of stylesheet.

### Changed
- Southwest and New England examples ship explicit `routes:` blocks (matching the Oregon pattern). Polylines follow real road geometry (I-15, US-89, Kancamagus Hwy, Rt 100, etc.) instead of relying on auto-generation. NYC stays auto-generated.
- All four examples now ship `origin_lat`/`origin_lng` (Oregon/Folsom, Southwest/Las Vegas, NYC/JFK, New England/Boston).
- **Agent skill rewritten** to reflect the validate workflow, `theme.hotel_label`, the `routes[]` convention (when to use vs. when to omit), the lodging-anchor auto-fallback, origin/destination guidance, the 250-mi long-leg warning, and 12 lessons learned (two new from this set of work).
- CONTRIBUTING: documented the routes convention — road trips should ship explicit `routes:`, city trips can omit.

## [1.0.1] — 2026-04-30

### Fixed
- `examples/oregon-spring-2026.yaml`: corrected `total_stops: 22 → 19` to match actual stop count.
- Renderer: added inline-SVG favicon to silence the `/favicon.ico` 404 and provide a brand mark.

### Changed
- Package size dropped from ~7.6 MB unpacked to ~70 KB by excluding `docs/screenshot.png` from the npm tarball; README now references the screenshot via an absolute GitHub raw URL so it still renders on npmjs.com.
- README leads with `npx tripkit ...` (no clone, no install) as the recommended entry point; clone-and-hack flow demoted to a secondary option.
- CLI now supports `--help` and `--version` flags and adapts help text based on whether it was invoked as `tripkit` or `node convert.js`.

## [1.0.0] — 2026-04-30

Initial release.

- YAML schema (`schema/tripkit.schema.yaml`) — the data contract.
- Self-contained HTML renderer with Leaflet map, day-by-day sidebar, hotel markers, route polylines.
- CLI converter: `tripkit <trip.yaml> [output.html]`.
- Oregon Spring Break 2026 example trip (6 days, 19 stops).
- Agent skill + questionnaire for AI-assisted trip planning.
