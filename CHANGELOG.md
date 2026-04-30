# Changelog

All notable changes to TripKit are documented here. Versioning follows [SemVer](https://semver.org/).

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
