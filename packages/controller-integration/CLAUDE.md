# controller-integration

> **Tier 3** — Depends on `midi-engine` (via bridge), `document-model`.

## What This Is

Hardware controller integration. Auto-mapping, controller profiles, MIDI learn, and specific support for Ableton Push, Novation Launchpad, Monome, etc.

## Public API

```typescript
export class ControllerManager {
  registerProfile(profile: ControllerProfile): void;
  autoMap(controller: MidiDevice, context: MappingContext): ControllerMapping;
  learnMapping(target: ParameterRef): Promise<ControllerMapping>;
}

export interface ControllerProfile {
  name: string;  // "Ableton Push 2"
  vendorId: number;
  productId: number;
  controls: ControlDefinition[];
  bidirectional: boolean; // can send LED feedback
}
```

## Dependencies
- `document-model` (Tier 0) — parameter references
- `midi-engine` (Tier 0, via Tauri bridge) — MIDI device access

## Definition of Done
- [ ] Generic MIDI controller auto-maps to selected node parameters
- [ ] MIDI learn mode works (move knob → maps to parameter)
- [ ] At least one specific controller profile (e.g., Launchpad) with LED feedback
- [ ] Controller mappings save/load with patch
