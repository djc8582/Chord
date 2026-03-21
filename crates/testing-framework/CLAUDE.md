# testing-framework

> **Tier 3** — Depends on `dsp-runtime`, `diagnostics`, `node-library`.

## What This Is

Patch testing framework. Audio assertions, snapshot testing, fuzz testing, and a CLI runner for CI/CD. Claude Code uses this to verify patches it builds.

## Public API

```rust
pub struct PatchTest {
    pub fn assert_signal(node: NodeId, port: PortId, assertion: SignalAssertion);
    pub fn assert_no_problems();
    pub fn assert_cpu_under(percent: f64);
    pub fn snapshot_compare(reference: &Path, tolerance: f64);
    pub fn fuzz(iterations: usize, seed: u64);
}

pub enum SignalAssertion {
    PeakBelow(f32),
    RmsInRange(f32, f32),
    FrequencyIs(f32, f32), // (frequency, tolerance_hz)
    NonSilent,
    NoDcOffset(f32),       // tolerance
    NoClicks(f32),         // sensitivity
}
```

## Dependencies
- `dsp-runtime` (Tier 1), `diagnostics` (Tier 2), `node-library` (Tier 2)

## Definition of Done
- [ ] Signal assertions pass for known-good patches
- [ ] Signal assertions fail for known-bad patches
- [ ] Snapshot testing detects changes in audio output
- [ ] Fuzz testing finds NaN in edge cases
- [ ] CLI runner outputs JUnit XML
