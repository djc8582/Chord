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
/// - `[0]` combined trigger output: 1.0 when any pattern fires, 0.0 otherwise.
pub struct PolyrhythmEngine {
    /// Clock counter for pattern A.
    counter_a: u32,
    /// Clock counter for pattern B.
    counter_b: u32,
    /// Clock counter for pattern C.
    counter_c: u32,
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Current trigger output value.
    trigger_value: f32,
    /// Samples since last trigger (for trigger pulse timing).
    samples_since_trigger: u64,
    /// Trigger pulse duration in samples.
    trigger_duration: u64,
}

impl PolyrhythmEngine {
    pub fn new() -> Self {
        Self {
            counter_a: 0,
            counter_b: 0,
            counter_c: 0,
            clock_was_high: false,
            trigger_value: 0.0,
            samples_since_trigger: 0,
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
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            // Detect rising edge of clock.
            if clock && !self.clock_was_high {
                // Check if any pattern fires on this clock tick.
                let fires_a = self.counter_a % pattern_a == 0;
                let fires_b = self.counter_b % pattern_b == 0;
                let fires_c = self.counter_c % pattern_c == 0;

                if fires_a || fires_b || fires_c {
                    self.trigger_value = 1.0;
                    self.samples_since_trigger = 0;
                    self.trigger_duration = (ctx.sample_rate * 0.05) as u64; // 50ms pulse
                    if self.trigger_duration == 0 {
                        self.trigger_duration = 1;
                    }
                }

                // Advance all counters.
                self.counter_a = self.counter_a.wrapping_add(1);
                self.counter_b = self.counter_b.wrapping_add(1);
                self.counter_c = self.counter_c.wrapping_add(1);

                // Wrap counters at LCM-scale values to avoid u32 overflow over very long runs.
                // Using a large common wrap point that is a multiple of all possible pattern values.
                // LCM(2..16) = 720720, so we wrap there.
                const WRAP_POINT: u32 = 720720;
                if self.counter_a >= WRAP_POINT {
                    self.counter_a -= WRAP_POINT;
                }
                if self.counter_b >= WRAP_POINT {
                    self.counter_b -= WRAP_POINT;
                }
                if self.counter_c >= WRAP_POINT {
                    self.counter_c -= WRAP_POINT;
                }
            }
            self.clock_was_high = clock;

            // End the trigger pulse after duration.
            if self.samples_since_trigger >= self.trigger_duration {
                self.trigger_value = 0.0;
            }

            output[i] = self.trigger_value;
            self.samples_since_trigger += 1;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.counter_a = 0;
        self.counter_b = 0;
        self.counter_c = 0;
        self.clock_was_high = false;
        self.trigger_value = 0.0;
        self.samples_since_trigger = 0;
    }
}
