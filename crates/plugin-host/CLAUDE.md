# plugin-host

> **Tier 2** — Depends on `dsp-runtime`.

## What This Is

Hosts VST3, CLAP, and AU audio plugins. Each plugin appears as an AudioNode in the graph. Plugin scanning, GUI hosting, state serialization, and crash isolation.

## Public API

```rust
pub struct PluginScanner;
impl PluginScanner {
    pub fn scan_directories(paths: &[PathBuf]) -> Vec<PluginInfo>;
}

pub struct PluginInfo {
    pub name: String,
    pub vendor: String,
    pub format: PluginFormat, // VST3, CLAP, AU
    pub path: PathBuf,
    pub uid: String,
    pub is_instrument: bool,
    pub is_effect: bool,
}

pub struct HostedPlugin; // implements AudioNode
impl HostedPlugin {
    pub fn load(info: &PluginInfo) -> Result<Self>;
    pub fn show_gui(&mut self);
    pub fn save_state(&self) -> Vec<u8>;
    pub fn load_state(&mut self, state: &[u8]);
}

// For VST freeze/bake
pub struct PluginFreezer;
impl PluginFreezer {
    pub fn freeze_to_audio(plugin: &HostedPlugin, midi: &[MidiEvent], duration: f64) -> AudioBuffer;
    pub fn capture_ir(plugin: &HostedPlugin, settings: &IrCaptureSettings) -> ImpulseResponse;
    pub fn capture_multisample(plugin: &HostedPlugin, settings: &MultisampleSettings) -> MultisampleData;
}
```

## Implementation Details
- Plugins run in separate processes (crash isolation)
- Shared memory for audio buffers between host and plugin process
- Background scanning (never blocks main thread)
- Plugin GUIs in platform-native windows
- State serialization compatible with DAW preset formats

## Dependencies
- `dsp-runtime` (Tier 1) — AudioNode trait
- External: `vst3-sys`, `clack-host` crates

## Definition of Done
- [ ] Scan and list VST3 plugins from standard directories
- [ ] Load a VST3 plugin as an AudioNode and process audio through it
- [ ] Plugin parameters exposed as node parameters
- [ ] Plugin GUI opens in a window
- [ ] Plugin state saves/loads with the patch
- [ ] Plugin crash doesn't crash the app
- [ ] Freeze-to-audio works (render plugin output to buffer)
- [ ] IR capture works for effect plugins
