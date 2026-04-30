# 🗺️ TripKit

**Open-source framework for AI-assisted trip planning with beautiful interactive visualizers.**

TripKit is a structured data schema + rendering engine that turns trip plans into stunning interactive maps with day-by-day itineraries. It works with any AI agent (Claude, GPT, Gemini) or can be filled in manually.

<p align="center">
  <img src="docs/screenshot.png" alt="TripKit Visualizer" width="800">
</p>

## Why TripKit?

Most trip planning tools give you either:
- **A map with pins** (no context, no schedule, no restaurants)
- **A text itinerary** (no visual, hard to share, impossible to navigate from)

TripKit gives you **both** — a Leaflet interactive map with route polylines, stop markers, and hotel markers, alongside a rich sidebar with weather, meals, lodging confirmations, alerts, and pro tips for each day.

Born from a real 6-day Oregon road trip planned iteratively with AI. Every feature exists because we needed it on the road.

## How It Works

```
┌─────────────────────────────────────────────┐
│  1. QUESTIONNAIRE                           │
│     Conversational elicitation → Trip Brief  │
├─────────────────────────────────────────────┤
│  2. RESEARCH & PLANNING                     │
│     Trip Brief → Trip Plan (YAML)           │
├─────────────────────────────────────────────┤
│  3. RENDER                                  │
│     YAML → Interactive HTML or React app    │
├─────────────────────────────────────────────┤
│  4. ITERATE                                 │
│     Feedback → Updated YAML → Re-render     │
└─────────────────────────────────────────────┘
```

**The YAML schema is the product.** Renderers are interchangeable. The AI layer is optional but powerful.

## Quick Start

### Option 1: CLI (developers)

```bash
# Clone the repo
git clone https://github.com/piti/tripkit.git
cd tripkit

# Install dependencies
npm install

# Convert a YAML trip plan to interactive HTML
node convert.js examples/oregon-spring-2026.yaml my-trip.html

# Open in browser
open my-trip.html
```

### Option 2: With an AI Agent (everyone)

1. Start a conversation with your preferred AI agent (Claude recommended)
2. Share the `agent/AGENT-SKILL.md` as context
3. Tell it about your trip: _"I'm planning a 5-day road trip through the Pacific Northwest with my family..."_
4. The agent uses the questionnaire to gather details, researches routes/hotels/restaurants, and generates a TripKit YAML file
5. Convert to HTML with the CLI, or ask the agent to render it directly

### Option 3: Manual (no AI needed)

1. Copy `examples/oregon-spring-2026.yaml` as a starting template
2. Edit with your own trip data
3. Run `node convert.js your-trip.yaml`
4. Open the generated HTML file

## Project Structure

```
tripkit/
├── schema/
│   └── tripkit.schema.yaml      # Data contract — the spec
├── examples/
│   └── oregon-spring-2026.yaml  # Complete real-world example
├── renderers/
│   ├── html/
│   │   └── tripkit-renderer.html  # Self-contained HTML renderer
│   └── react/
│       └── (coming soon)          # React component library
├── agent/
│   ├── questionnaire.yaml       # Elicitation template
│   └── AGENT-SKILL.md           # System prompt for AI agents
├── docs/
│   └── screenshot.png
├── convert.js                   # YAML → HTML CLI tool
├── package.json
└── README.md
```

## Schema Overview

The YAML schema captures everything needed for a complete trip plan:

```yaml
trip:           # Title, dates, travelers, origin
days:           # Array of day plans, each containing:
  - number      #   Day number
    title       #   Route summary
    date        #   Date string
    status      #   completed | active | upcoming
    color       #   Map route color (hex)
    summary     #   Drive time, hike time, miles
    weather     #   Forecast (filled closer to trip)
    meals       #   Breakfast, lunch, dinner recommendations
    lodging     #   Hotel name, confirmation, coordinates
    alerts      #   Warnings (road closures, age restrictions)
    tips        #   Pro tips from experience
    stops       #   Array of stops with lat/lng, descriptions, nav links
routes:         # Map polylines (optional — auto-generated if omitted)
theme:          # Visual customization (colors, fonts, map style)
agent_context:  # Preferences, constraints, iteration log (for AI agents)
```

See `schema/tripkit.schema.yaml` for the complete specification.

## Features

### Interactive Map
- Leaflet.js with Esri terrain/satellite/NatGeo tile layers
- Day-colored route polylines
- Numbered stop markers with popup details
- Branded hotel markers with confirmation numbers
- Click a day → map zooms to that segment
- Click a stop → map zooms and opens popup

### Day-by-Day Sidebar
- Weather callouts with forecasts
- Alert banners (road closures, permit requirements, age restrictions)
- Pro tip callouts
- Stop cards with images, descriptions, duration, parking fees
- Meal recommendations (breakfast, lunch, dinner)
- Lodging with confirmation numbers and navigate links

### Navigation Links
Every stop and hotel includes a Google Maps navigation URL:
```
https://www.google.com/maps/dir/?api=1&destination=...
```
Click on your phone → opens turn-by-turn directions from your current location.

### Real-Time Adaptation
The schema supports iterative refinement:
- `status` field tracks completed/active/upcoming days
- `agent_context.iteration_log` captures all changes and reasoning
- Weather can be updated day-by-day as forecasts become available
- Stops can be added/removed/reordered without breaking the renderer

## Design Decisions

### Why YAML?
- Human-readable AND machine-writable
- Supports comments (JSON doesn't)
- Easy to hand-edit for tweaks
- Trivial conversion to JSON for rendering

### Why Leaflet?
- Free, open-source, no API key needed
- Works offline once tiles are cached
- Lightweight — entire renderer is a single HTML file
- Esri tile layers are beautiful and free for non-commercial use

### Why single-file HTML?
- Zero dependencies at runtime (Leaflet loaded from CDN)
- Share via email, Slack, Dropbox — recipient just opens the file
- Works offline (after first load caches tiles)
- No hosting needed

## Lessons Learned

Built from a real trip. These lessons are encoded in the agent skill:

1. **Day 1 is always the longest drive** — plan a light evening
2. **Families run 30-60 min behind** — build buffer, not precision
3. **Leave 20% slack per day** — best stops are often unplanned
4. **Hotel chain loyalty matters** — 5 nights = meaningful points
5. **Free breakfast saves $15-20/person/day** — real budget factor
6. **One big hike per day max** — even fit families burn out
7. **Verify age restrictions** — breweries and hot springs are often 21+
8. **Drive times are optimistic** — add 15-20% for real-world stops
9. **Weather changes everything** — check 2 days out and adapt
10. **The iteration log is gold** — captures reasoning for next trip

## Contributing

PRs welcome! Especially:
- [ ] React renderer component library
- [ ] Mobile-responsive improvements
- [ ] Dark mode theme
- [ ] YAML validation CLI tool
- [ ] More example trips
- [ ] Internationalization (metric units, languages)
- [ ] Export to Google My Maps
- [ ] Import from Google Maps saved places

## License

MIT — use it, fork it, build on it.

---

*Built with ❤️ from a real family road trip through Oregon. If you use TripKit for your next adventure, we'd love to hear about it.*
