//! Step Sequencer node.
//!
//! A classic step sequencer that advances through a pattern of MIDI note values
//! on each clock trigger. Outputs pitch (as MIDI note number) and gate signals.
//! The default pattern is an ascending C major scale.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum number of steps in the sequencer.
const MAX_STEPS: usize = 32;

/// Default C major scale ascending pattern (C4 through C5).
const DEFAULT_PATTERN: [f32; 8] = [60.0, 62.0, 64.0, 65.0, 67.0, 69.0, 71.0, 72.0];

/// Step Sequencer node.
///
/// ## Parameters
/// - `steps` — Number of active steps in the pattern (default 8, range 1..32).
/// - `gate_length` — Gate duration as fraction of step (default 0.5, range 0..1).
///
/// ## Inputs
/// - `[0]` clock input: rising edge (crossing above 0.5) triggers the next step.
///
/// ## Outputs
/// - `[0]` pitch output: MIDI note number (e.g., 60.0 = middle C).
/// - `[1]` gate trigger: 1.0 when gate is active, 0.0 otherwise.
pub struct StepSequencer {
    /// The step pattern storing MIDI note values.
    pattern: [f32; MAX_STEPS],
    /// Current step index.
    current_step: usize,
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Current pitch output value.
    pitch_value: f32,
    /// Current gate output value.
    gate_value: f32,
    /// Samples elapsed since the last clock trigger.
    samples_since_trigger: u64,
    /// Gate duration in samples (computed from gate_length and clock period).
    gate_duration_samples: u64,
    /// Samples between the last two clock triggers (for estimating clock period).
    clock_period_samples: u64,
    /// Counter tracking samples since last trigger for clock period estimation.
    samples_since_last_clock: u64,
}

impl StepSequencer {
    pub fn new() -> Self {
        let mut pattern = [60.0_f32; MAX_STEPS];
        for (i, note) in DEFAULT_PATTERN.iter().enumerate() {
            pattern[i] = *note;
        }
        Self {
            pattern,
            current_step: 0,
            clock_was_high: false,
            pitch_value: 60.0,
            gate_value: 0.0,
            samples_since_trigger: 0,
            gate_duration_samples: 4800, // ~100ms at 48kHz default
            clock_period_samples: 9600,  // ~200ms at 48kHz default
            samples_since_last_clock: 0,
        }
    }
}

impl Default for StepSequencer {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for StepSequencer {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let steps = (ctx.parameters.get("steps").unwrap_or(8.0) as usize).clamp(1, MAX_STEPS);
        let gate_length = ctx.parameters.get("gate_length").unwrap_or(0.5).clamp(0.0, 1.0);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_clock = !ctx.inputs.is_empty();
        let has_gate_output = ctx.outputs.len() > 1;

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            // Detect rising edge of clock.
            if clock && !self.clock_was_high {
                // Estimate clock period from time between triggers.
                if self.samples_since_last_clock > 0 {
                    self.clock_period_samples = self.samples_since_last_clock;
                }
                self.samples_since_last_clock = 0;

                // Compute gate duration from gate_length and clock period.
                self.gate_duration_samples =
                    (self.clock_period_samples as f32 * gate_length) as u64;
                if self.gate_duration_samples == 0 {
                    self.gate_duration_samples = 1;
                }

                // Output the current step's pitch and open the gate.
                self.pitch_value = self.pattern[self.current_step];
                self.gate_value = 1.0;
                self.samples_since_trigger = 0;

                // Advance to next step.
                self.current_step = (self.current_step + 1) % steps;
            }
            self.clock_was_high = clock;

            // Close the gate after gate_duration_samples.
            if self.samples_since_trigger >= self.gate_duration_samples {
                self.gate_value = 0.0;
            }

            ctx.outputs[0][i] = super::midi_to_hz(self.pitch_value);
            if has_gate_output {
                ctx.outputs[1][i] = self.gate_value;
            }

            self.samples_since_trigger += 1;
            self.samples_since_last_clock += 1;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.current_step = 0;
        self.clock_was_high = false;
        self.pitch_value = 60.0;
        self.gate_value = 0.0;
        self.samples_since_trigger = 0;
        self.samples_since_last_clock = 0;
    }
}
