//! Gate node — noise gate with threshold, attack, hold, and release.
//!
//! Silences audio when the input level falls below the threshold.
//! Uses an envelope follower to detect signal level and a hold time
//! to prevent chattering at the threshold boundary.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Gate state machine states.
#[derive(Debug, Clone, Copy, PartialEq)]
enum GateState {
    /// Gate is closed (output is silent).
    Closed,
    /// Gate is opening (attack phase, gain ramping up).
    Attack,
    /// Gate is open (signal passes through).
    Open,
    /// Gate is in hold phase (signal passes, waiting before release).
    Hold,
    /// Gate is closing (release phase, gain ramping down).
    Release,
}

/// Gate node.
///
/// ## Parameters
/// - `threshold` — Gate threshold in dB (default -40.0, range -80..0).
/// - `attack` — Attack time in ms (default 1.0, range 0.01..50).
/// - `hold` — Hold time in ms (default 50.0, range 0..500).
/// - `release` — Release time in ms (default 50.0, range 1..500).
///
/// ## Inputs
/// - `[0]` audio input.
///
/// ## Outputs
/// - `[0]` gated audio output.
pub struct Gate {
    state: GateState,
    /// Current gate gain (0.0 = closed, 1.0 = open).
    gain: f64,
    /// Hold counter in samples.
    hold_counter: usize,
    /// Envelope follower for level detection.
    envelope: f64,
}

impl Gate {
    pub fn new() -> Self {
        Self {
            state: GateState::Closed,
            gain: 0.0,
            hold_counter: 0,
            envelope: 0.0,
        }
    }
}

impl Default for Gate {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for Gate {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let base_threshold_db = (ctx.parameters.get("threshold").unwrap_or(-40.0) as f64).clamp(-80.0, 0.0);
        let attack_ms = (ctx.parameters.get("attack").unwrap_or(1.0) as f64).clamp(0.01, 50.0);
        let hold_ms = (ctx.parameters.get("hold").unwrap_or(50.0) as f64).clamp(0.0, 500.0);
        let release_ms = (ctx.parameters.get("release").unwrap_or(50.0) as f64).clamp(1.0, 500.0);

        let attack_samples = (attack_ms * 0.001 * ctx.sample_rate).max(1.0);
        let attack_inc = 1.0 / attack_samples;
        let hold_samples = (hold_ms * 0.001 * ctx.sample_rate) as usize;
        let release_samples = (release_ms * 0.001 * ctx.sample_rate).max(1.0);
        let release_dec = 1.0 / release_samples;

        // Check for modulation input: threshold_mod at [1]
        let has_threshold_mod = ctx.inputs.len() > 1 && !ctx.inputs[1].is_empty();

        // Envelope follower coefficient for level detection (~5ms).
        let env_coeff = (-1.0 / (0.005 * ctx.sample_rate)).exp();

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            let sample = input[i] as f64;
            let abs_sample = sample.abs();

            // Per-sample modulation (dB scale: mod * 40.0)
            let thr_mod = if has_threshold_mod { ctx.inputs[1][i] as f64 } else { 0.0 };
            let threshold_db = (base_threshold_db + thr_mod * 40.0).clamp(-80.0, 0.0);
            let threshold_linear = 10.0_f64.powf(threshold_db / 20.0);

            // Update envelope follower.
            if abs_sample > self.envelope {
                self.envelope = abs_sample; // Instant peak detection.
            } else {
                self.envelope = env_coeff * self.envelope + (1.0 - env_coeff) * abs_sample;
            }

            // Denormal protection.
            if self.envelope < 1e-30 {
                self.envelope = 0.0;
            }

            // Hysteresis: once the gate opens, the close threshold is 3 dB lower
            // than the open threshold.  This prevents chatter when the signal
            // hovers near the threshold.
            let hysteresis_factor = 0.708; // ~-3 dB
            let above_open = self.envelope >= threshold_linear;
            let above_close = self.envelope >= threshold_linear * hysteresis_factor;

            // State machine.
            match self.state {
                GateState::Closed => {
                    if above_open {
                        self.state = GateState::Attack;
                    }
                }
                GateState::Attack => {
                    self.gain += attack_inc;
                    if self.gain >= 1.0 {
                        self.gain = 1.0;
                        self.state = GateState::Open;
                    }
                    // Use lower (close) threshold during attack to avoid premature release.
                    if !above_close {
                        self.state = GateState::Release;
                    }
                }
                GateState::Open => {
                    if !above_close {
                        self.hold_counter = hold_samples;
                        self.state = GateState::Hold;
                    }
                }
                GateState::Hold => {
                    if above_close {
                        self.state = GateState::Open;
                    } else if self.hold_counter == 0 {
                        self.state = GateState::Release;
                    } else {
                        self.hold_counter -= 1;
                    }
                }
                GateState::Release => {
                    if above_open {
                        self.state = GateState::Attack;
                    } else {
                        self.gain -= release_dec;
                        if self.gain <= 0.0 {
                            self.gain = 0.0;
                            self.state = GateState::Closed;
                        }
                    }
                }
            }

            output[i] = (sample * self.gain) as f32;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.state = GateState::Closed;
        self.gain = 0.0;
        self.hold_counter = 0;
        self.envelope = 0.0;
    }
}
