# Contributing to TripKit

We welcome contributions! Here's how to get involved.

## Roadmap

### Now
- Mobile polish (legend overlap, day-nav crowding at iPhone widths)
- Dark mode theme support (`theme.dark_mode: true`)
- YAML validation CLI (`tripkit validate trip.yaml`)

### Next
- React renderer component library (`<TripMap>`, `<DaySidebar>`, `<StopCard>`)
- More example trips (submit your own!)
- Import/export Google My Maps KML
- Internationalization (metric units, multi-language)

### Later
- Real-time weather API integration
- Flight + hotel search for non-road-trip journeys
- Budget tracking with running cost totals
- Export to PDF for offline use

## How to Contribute

### Submit an Example Trip
The easiest way to contribute! Plan a trip using the schema, submit your YAML as a PR to `examples/`. Anonymize any personal info (confirmation numbers, names).

### Improve the Renderer
The HTML renderer is at `renderers/html/tripkit-renderer.html`. Test changes with:
```bash
npm install
npm test                                        # quick smoke test
node convert.js examples/oregon-spring-2026.yaml /tmp/test.html
open /tmp/test.html
```

### Publishing a New Version (maintainers)
```bash
npm version patch   # or minor / major
npm publish         # prepublishOnly hook runs npm test first
git push --follow-tags
```

### Build the React Renderer
We need React components that consume the same YAML/JSON schema. See `renderers/react/` for the placeholder.

### Improve the Agent Skill
The agent system prompt is at `agent/AGENT-SKILL.md`. If you've used TripKit with an AI agent and learned something, add it to the lessons learned section.

## Guidelines
- Keep the schema backward-compatible — new fields should be optional
- The HTML renderer must remain a single self-contained file (no external CSS/JS beyond CDN)
- All example trips must be anonymized (no real confirmation numbers, names, or identifying info)
- Test with the Oregon example — it exercises all renderer features

## License
MIT — your contributions will be released under the same license.
