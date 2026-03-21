# shell

> **Tier 1** — Depends on `document-model`.

## What This Is

The app shell: panel layout system, routing, global state, Tauri bridge, and keyboard shortcuts. This is the container that all other UI modules plug into.

## Responsibilities
- Panel layout (resizable, collapsible, detachable panels)
- Menu bar and command palette (Cmd+K)
- Keyboard shortcut system
- Tauri IPC bridge (typed commands to Rust backend)
- Global state store (Zustand) for UI-only state
- Theme system
- File operations (new, open, save, save-as)

## Key Exports
```typescript
export function useBridge(): BridgeCommands; // typed Tauri invoke wrapper
export function useCommand(id: string, handler: () => void): void; // register command
export function useShortcut(keys: string, handler: () => void): void;
export function registerPanel(config: PanelConfig): void;
```

## Dependencies
- `document-model` (Tier 0) — patch document access

## Definition of Done
- [ ] App launches with panel layout (canvas center, inspector right, timeline bottom)
- [ ] Panels resize and collapse
- [ ] Cmd+K opens command palette
- [ ] Keyboard shortcuts work (Space = play/stop, N = add node)
- [ ] Tauri bridge sends typed commands to Rust
- [ ] Theme switching works (at least dark/light)
