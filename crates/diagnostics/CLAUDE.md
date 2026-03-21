# diagnostics

> **Tier 2** — Depends on `dsp-runtime`.

## What This Is

Real-time audio diagnostics and self-monitoring. Hooks into the processing pipeline, continuously analyzes signal health at every connection, detects problems (clipping, clicks, NaN, DC offset, phase issues), and reports them. Also includes the performance profiler and testing assertions.

## Public API

```rust
pub trait DiagnosticProbe: Send {
    fn on_buffer_processed(&mut self, node_id: NodeId, port: PortId, buffer: &AudioBuffer);
    fn on_error(&mut self, node_id: NodeId, error: AudioError);
    fn on_node_timing(&mut self, node_id: NodeId, duration: Duration);
}

pub struct DiagnosticEngine; // implements DiagnosticProbe
impl DiagnosticEngine {
    pub fn new(config: DiagnosticConfig) -> Self;
    pub fn get_signal_stats(&self, node_id: NodeId, port: PortId) -> Option<SignalStats>;
    pub fn get_problems(&self) -> Vec<Problem>;
    pub fn get_cpu_profile(&self) -> CpuProfile;
    pub fn run_full_diagnostic(&self) -> DiagnosticReport;
}

pub struct SignalStats {
    pub peak: f32,
    pub rms: f32,
    pub dc_offset: f32,
    pub crest_factor: f32,
    pub zero_crossing_rate: f32,
    pub has_nan: bool,
    pub has_inf: bool,
    pub click_count: u32,
}

pub struct Problem {
    pub id: ProblemId,
    pub severity: Severity, // Info, Warning, Error, Critical
    pub category: ProblemCategory, // Clipping, Click, DcOffset, NaN, etc.
    pub node_id: NodeId,
    pub port_id: Option<PortId>,
    pub description: String,
    pub auto_fix: Option<AutoFix>,
}

pub enum AutoFix {
    InsertGain(f64),
    InsertDcBlocker,
    InsertLimiter,
    MuteNode,
    BypassNode,
    IncreaseBufferSize(u32),
}
```

## Implementation Details
- Piggyback on audio thread: single-pass analysis adds < 0.1% CPU
- Lock-free reporting: stats written by audio thread, read by UI thread via atomic snapshots
- Click detection: sample discontinuity + crest factor heuristic
- History buffer: last 10 seconds of stats per connection for scrubbing

## Dependencies
- `dsp-runtime` (Tier 1) — DiagnosticProbe trait, AudioBuffer, NodeId

## Definition of Done
- [ ] Detects clipping (peak > 0dBFS)
- [ ] Detects clicks/pops (sample discontinuity)
- [ ] Detects DC offset
- [ ] Detects NaN/Inf
- [ ] Detects CPU spikes per node
- [ ] Auto-fix suggestions generated for each problem type
- [ ] Stats accessible from UI thread without locking
- [ ] < 0.1% CPU overhead on a 100-node graph
