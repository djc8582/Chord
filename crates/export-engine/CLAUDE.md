# export-engine

> **Tier 4** — Depends on `audio-graph`, `node-library`, `diagnostics`.

## What This Is

Compiles patches to deployable packages for every target: web (npm/React), desktop, mobile, game engines (Unity/Unreal/Godot), and DAW plugins (VST3/CLAP/AU).

## Public API

```rust
pub struct ExportEngine;

impl ExportEngine {
    pub fn export(patch: &Patch, target: ExportTarget, options: ExportOptions) -> Result<ExportOutput>;
    pub fn list_targets() -> Vec<ExportTarget>;
    pub fn validate_for_export(patch: &Patch, target: ExportTarget) -> Vec<ExportWarning>;
}

pub enum ExportTarget {
    WebReact, WebVanilla, WebWidget,
    DesktopStandalone,
    IosFramework, AndroidLibrary,
    UnityPlugin, UnrealPlugin, GodotPlugin,
    Vst3, Clap, AudioUnit,
    StandaloneBinary,
}

pub struct ExportOptions {
    pub name: String,
    pub exposed_parameters: Vec<ParameterExpose>,
    pub include_visualizer: bool,
    pub freeze_vsts: bool,
    pub quality: ExportQuality, // Fast, Balanced, Maximum
}
```

## Implementation Details
- Web: Compile DSP graph to WASM via wasm-bindgen. Bundle as npm package.
- Desktop: Package as Tauri app (minimal, audio-only).
- Mobile: Cross-compile Rust to iOS (xcframework) / Android (JNI + .so).
- Game: Generate C/C# bindings. Package as engine-specific plugin format.
- Plugin: Wrap in VST3/CLAP/AU SDK boilerplate. Include generated parameter list.
- VST freeze: Use PluginFreezer from plugin-host before export.
- Doc generation: Auto-generate README, API reference, signal flow diagram.

## Dependencies
- `audio-graph` (Tier 0) — patch structure
- `node-library` (Tier 2) — node implementations for compilation
- `diagnostics` (Tier 2) — pre-export validation

## Definition of Done
- [ ] Export to web (WASM + JS wrapper) works for a simple oscillator patch
- [ ] Export to VST3 works and loads in a DAW
- [ ] Export to standalone binary works
- [ ] Frozen VSTs produce correct audio in exports
- [ ] Auto-generated documentation is accurate
- [ ] Exported React component renders and produces audio
