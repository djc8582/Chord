# Game UI with Adaptive Audio

A simple game interface demonstrating adaptive music that responds to gameplay state.

## Patterns Demonstrated

1. **Adaptive music** — base ambient layer + combat intensity layer, crossfaded by game state
2. **State-driven parameters** — danger level maps to filter cutoff, distortion, tempo
3. **Achievement sounds** — playNote with ascending intervals on score milestones
4. **Glitch transitions** — rapid parameter changes synced with visual glitch effects
5. **Health/damage feedback** — low health = darker filter, hit = transient pitch drop
6. **Audio-reactive HUD** — bindAudioToCSS drives HUD element glow/pulse

## Run

```bash
npm install
npm run dev
```

## Architecture

- `src/audio/game-engine.ts` — Builds the adaptive audio patch, exposes control functions
- `src/components/GameHUD.tsx` — Heads-up display with audio-reactive elements
- `src/components/GameWorld.tsx` — Simple game world with clickable enemies
- `src/hooks/useGameState.ts` — Game state management driving audio parameters
