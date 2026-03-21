# audio-io

> **Tier 2** — Depends on `dsp-runtime`.

## What This Is

Cross-platform audio I/O via CPAL. Manages audio devices, creates audio streams, and calls `AudioEngine::process()` in the audio callback.

## Public API

```rust
pub struct AudioHost;

impl AudioHost {
    pub fn new() -> Self;
    pub fn list_devices(&self) -> Vec<AudioDevice>;
    pub fn open_stream(&mut self, config: StreamConfig, engine: Arc<AudioEngine>) -> Result<AudioStream>;
}

pub struct AudioDevice {
    pub name: String,
    pub input_channels: usize,
    pub output_channels: usize,
    pub sample_rates: Vec<u32>,
}

pub struct StreamConfig {
    pub input_device: Option<String>,
    pub output_device: String,
    pub sample_rate: u32,
    pub buffer_size: u32,
}
```

## Dependencies
- `dsp-runtime` (Tier 1)
- External: `cpal` crate

## Definition of Done
- [ ] Lists audio devices on macOS, Windows, Linux
- [ ] Opens stream and routes through AudioEngine
- [ ] Buffer size configurable (64–2048)
- [ ] Device disconnection/reconnection handled
- [ ] Latency measurement working
- [ ] Multiple simultaneous devices supported
