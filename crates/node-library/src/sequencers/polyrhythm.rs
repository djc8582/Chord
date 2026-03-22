//! Polyrhythm Engine node.
//!
//! Runs three independent rhythmic patterns simultaneously, each cycling at
//! its own rate relative to the incoming clock. The output is the logical OR
//! of all three patterns: a trigger fires whenever any pattern fires.
//! For example, with patterns 3, 4, and 5, the combined rhythm creates
//! complex interlocking patterns from simple subdivisions.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Polyrhythm Engine node.
///
/// ## Parameters
/// - `pattern_a` — Division rate for pattern A (default 3, range 2..16).
/// - `pattern_b` — Division rate for pattern B (default 4, range 2..16).
/// - `pattern_c` — Division rate for pattern C (default 5, range 2..16).
///
/// ## Inputs
/// - `[0]` clock input: rising edge advances all pattern counters.
///
/// ## Outputs
/// - `[0]` pattern A trigger
/// - `[1]` pattern B trigger
/// - `[2]` pattern C trigger
pub struct PolyrhythmEngine {
    /// Shared clock counter (all patterns advance together).
    counter: u32,
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Current trigger values for each pattern.
    trigger_a: f32,
    trigger_b: f32,
    trigger_c: f32,
    /// Samples since last trigger for each pattern.
    since_a: u64,
    since_b: u64,
    since_c: u64,
    /// Trigger pulse duration in samples.
    trigger_duration: u64,
}

impl PolyrhythmEngine {
    pub fn new() -> Self {
        Self {
            counter: 0,
            clock_was_high: false,
            trigger_a: 0.0,
            trigger_b: 0.0,
            trigger_c: 0.0,
            since_a: u64::MAX,
            since_b: u64::MAX,
            since_c: u64::MAX,
            trigger_duration: 4800,
        }
    }
}

impl Default for PolyrhythmEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for PolyrhythmEngine {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let pattern_a = (ctx.parameters.get("pattern_a").unwrap_or(3.0) as u32).clamp(2, 16);
        let pattern_b = (ctx.parameters.get("pattern_b").unwrap_or(4.0) as u32).clamp(2, 16);
        let pattern_c = (ctx.parameters.get("pattern_c").unwrap_or(5.0) as u32).clamp(2, 16);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_clock = !ctx.inputs.is_empty();
        let has_out_b = ctx.outputs.len() > 1;
        let has_out_c = ctx.outputs.len() > 2;

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            if clock && !self.clock_was_high {
                self.trigger_duration = (ctx.sample_rate * 0.05) as u64;
                if self.trigger_duration == 0 {
                    self.trigger_duration = 1;
                }

                // Each pattern fires independently.
                if self.counter % pattern_a == 0 {
                    self.trigger_a = 1.0;
                    self.since_a = 0;
                }
                if self.counter % pattern_b == 0 {
                    self.trigger_b = 1.0;
                    self.since_b = 0;
                }
                if self.counter % pattern_c == 0 {
                    self.trigger_c = 1.0;
                    self.since_c = 0;
                }

                self.counter = self.counter.wrapping_add(1);
                const WRAP: u32 = 720720;
                if self.counter >= WRAP {
                    self.counter -= WRAP;
                }
            }
            self.clock_was_high = clock;

            // End trigger pulses after duration.
            if self.since_a >= self.trigger_duration {
                self.trigger_a = 0.0;
            }
            if self.since_b >= self.trigger_duration {
                self.trigger_b = 0.0;
            }
            if self.since_c >= self.trigger_duration {
                self.trigger_c = 0.0;
            }

            ctx.outputs[0][i] = self.trigger_a;
            if has_out_b {
                ctx.outputs[1][i] = self.trigger_b;
            }
            if has_out_c {
                ctx.outputs[2][i] = self.trigger_c;
            }

            self.since_a = self.since_a.saturating_add(1);
            self.since_b = self.since_b.saturating_add(1);
            self.since_c = self.since_c.saturating_add(1);
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.counter = 0;
        self.clock_was_high = false;
        self.trigger_a = 0.0;
        self.trigger_b = 0.0;
        self.trigger_c = 0.0;
        self.since_a = u64::MAX;
        self.since_b = u64::MAX;
        self.since_c = u64::MAX;
    }
}
