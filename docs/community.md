# Chord Community Library

Share, discover, and fork audio patches built with Chord.

## Browse & Search

### CLI

```bash
# Text search
npx chord search "lo-fi drums"

# Filter by category
npx chord search --category ambient

# Filter by multiple criteria
npx chord search --category beats --min-tempo 80 --max-tempo 100

# Sort by downloads, rating, or newest
npx chord search "ambient rain" --sort downloads
```

### API

```typescript
// From community server REST API
GET /api/search?q=ambient+rain&category=ambient&sort=downloads
GET /api/patches                    // List all patches
GET /api/patches/nature/gentle-rain // Get specific patch
```

## Use in Your Project

```typescript
// Patches are JSON files — download and load into Chord engine
import patchData from './patches/gentle-rain.chord.json';
import { Chord } from '@chord/web';

const engine = new Chord();
// Load patch data into engine by adding nodes and connections from JSON
for (const node of patchData.nodes) {
  engine.addNode(node.type);
  for (const [param, value] of Object.entries(node.params)) {
    engine.setParameter(node.id, param, value as number);
  }
}
for (const conn of patchData.connections) {
  const [fromId, fromPort] = conn.from.split(':');
  const [toId, toPort] = conn.to.split(':');
  engine.connect(fromId, fromPort, toId, toPort);
}
await engine.start();
```

## Fork via CLI

```bash
npx chord fork nature/gentle-rain
# Downloads to ./patches/gentle-rain.chord.json
# Now it's yours to modify

npx chord fork beats/lofi-kit --name my-lofi
# Downloads as ./patches/my-lofi.chord.json
```

## Publish

```bash
npx chord publish patches/my-ambient.chord.json
# Validates the patch (must pass audio quality checks)
# Prompts for: name, description, category, tags
# Uploads to community library
```

### Publishing Requirements

All published patches must pass:
- **Structural validation** — has nodes, connections, output node, valid references
- **Signal validation** — no clipping, no NaN, no DC offset, no clicks
- **Quality validation** — has variation over time, reasonable levels, frequency content
- Bundle size < 500KB (patch JSON)

### Categories

Patches are namespaced as `category/name`:

| Category | Description |
|----------|------------|
| `ambient` | Atmospheric, background, environmental |
| `beats` | Drum patterns, rhythmic loops |
| `bass` | Bass sounds, bass lines |
| `drums` | Drum kits, percussion sets |
| `effects` | Sound effects, transitions |
| `generative` | Algorithmic, evolving, probabilistic |
| `instruments` | Playable instrument patches |
| `lo-fi` | Lo-fi aesthetic, vinyl, tape |
| `meditation` | Meditation, breathing, relaxation |
| `notification` | Alert sounds, notification tones |
| `ui-sounds` | Button clicks, hover sounds, UI feedback |
| `game-audio` | Game music, game sound effects |
| `cinematic` | Film scoring, trailers, impacts |
| `experimental` | Avant-garde, noise, abstract |
| `texture` | Textures, drones, soundscapes |

### Naming

Examples:
```
ambient/gentle-rain
ambient/deep-ocean
beats/lofi-study
beats/trap-140
bass/acid-303
drums/kit-808
generative/gravity-bells
nature/forest-morning
cinematic/tension-builder
ui/notification-set
```

### Versioning

Patches are versioned with semver. When you fork, you pin to the source version.

```bash
npx chord update gentle-rain    # Update to latest version
```

### Licensing

- **Free tier:** all published patches are public (CC-BY-4.0)
- **Pro tier:** choose public or private

## Seed Library

The community launches with 20 high-quality patches:

| Slug | Description | Tempo | Key |
|------|------------|-------|-----|
| `ambient/breathing-space` | Meditation ambient with breath guide | 60 | C |
| `ambient/deep-ocean` | Underwater atmosphere with whale-like calls | 50 | Eb |
| `ambient/night-forest` | Nocturnal nature — crickets, owl, wind | — | — |
| `beats/lofi-study` | Lo-fi study beats with vinyl warmth | 80 | C |
| `beats/trap-140` | Hard trap beat with 808s | 140 | F# |
| `beats/jazz-brushes` | Jazz brush drums with swing | 95 | — |
| `bass/sub-808` | Deep 808 sub bass with long tail | 140 | F |
| `bass/acid-303` | Classic acid bass line | 130 | A |
| `drums/kit-808` | Full 808 drum kit | 120 | — |
| `drums/kit-acoustic` | Realistic acoustic drum kit | 100 | — |
| `generative/euclidean-bells` | Euclidean rhythms + tuned bells | 90 | D |
| `generative/gravity-ambient` | Gravity sequencer + evolving pads | 70 | Bb |
| `generative/markov-jazz` | Markov melody over jazz chords | 110 | G |
| `nature/rain-window` | Rain on a window, close mic | — | — |
| `nature/thunderstorm` | Full storm — rain, thunder, wind | — | — |
| `cinematic/tension-rise` | Slow tension builder — riser + accelerating rhythm | 100 | C# |
| `cinematic/impact-drop` | Massive sub impact with debris scatter | — | — |
| `fx/glitch-machine` | Rhythmic glitch effects | 128 | — |
| `ui/notification-set` | 5 notification sounds (info, success, warning, error, message) | — | — |
| `ui/button-clicks` | UI click/hover/toggle sound set | — | — |

Each seed patch passes structural validation, signal validation, and quality checks.

## Server API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patches` | List patches (paginated) |
| GET | `/api/patches/:slug` | Get patch details + JSON |
| POST | `/api/patches` | Publish a new patch |
| PUT | `/api/patches/:slug` | Update a patch |
| DELETE | `/api/patches/:slug` | Unpublish |
| POST | `/api/patches/:slug/fork` | Fork a patch |
| POST | `/api/patches/:slug/rate` | Rate a patch (1-5) |
| GET | `/api/search` | Full-text + filter search |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/users/:username` | User profile + patches |

### Search Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Text search |
| `category` | string | Filter by category |
| `minTempo` | number | Minimum BPM |
| `maxTempo` | number | Maximum BPM |
| `key` | string | Musical key |
| `minRating` | number | Minimum average rating |
| `sort` | string | `downloads`, `rating`, `newest`, `name` |
| `page` | number | Page number (1-based) |
| `pageSize` | number | Results per page (default 20, max 100) |
