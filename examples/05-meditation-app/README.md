# Meditation App with Generative Audio

A breathing meditation timer with generative ambient audio that follows the breath cycle.

## Patterns Demonstrated

1. **Breathing-synced audio** — filter cutoff and volume follow the inhale/exhale cycle
2. **Periodic singing bowl strikes** — random-interval playNote with pentatonic pitches
3. **Generative ambient drone** — sub-bass + filtered pad + noise texture, always evolving
4. **Session phases** — audio character changes across intro, active meditation, wind-down
5. **Audio-reactive breathing circle** — bindAudioToCSS drives the visual guide
6. **Binaural-adjacent tones** — slight frequency offset between L/R channels for depth

## Run

```bash
npm install
npm run dev
```

## Architecture

- `src/audio/meditation-patch.ts` — Builds the ambient meditation patch
- `src/components/BreathCircle.tsx` — Visual breathing guide, audio-reactive
- `src/components/Timer.tsx` — Session timer with phase management
- `src/hooks/useBreathCycle.ts` — Drives the 4-7-8 breathing pattern
