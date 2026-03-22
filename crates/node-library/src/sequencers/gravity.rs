//! Gravity Sequencer node.
//!
//! Simulates particles falling toward attractor points mapped to musical notes.
//! On each clock trigger, outputs the pitch of the note-attractor closest to
//! the nearest particle. Particles bounce and are affected by a gravity parameter,
//! creating evolving, physics-driven melodic patterns.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum number of particles.
const MAX_PARTICLES: usize = 16;

/// Number of attractor notes (one octave of chromatic pitches).
const NUM_ATTRACTORS: usize = 12;

/// Chromatic scale starting at middle C (MIDI 60).
const CHROMATIC_BASE: f32 = 60.0;

/// Scale patterns as semitone offsets from root.
/// 0 = chromatic, 1 = major, 2 = minor, 3 = pentatonic, etc.
const SCALES: [[i32; 12]; 12] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],  // 0: chromatic
    [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19], // 1: major
    [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19], // 2: minor
    [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26], // 3: pentatonic
    [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19], // 4: dorian
    [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19], // 5: phrygian
    [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19], // 6: lydian
    [0, 2, 4, 5, 7, 9, 10, 12, 14, 16, 17, 19], // 7: mixolydian
    [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19], // 8: harmonic minor
    [0, 3, 5, 6, 7, 10, 12, 15, 17, 18, 19, 22], // 9: blues
    [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19], // 10: ionian (same as major)
    [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19], // 11: aeolian (same as minor)
];

/// A particle in the gravity simulation.
#[derive(Clone)]
struct Particle {
    /// Position in note-space (0.0 to NUM_ATTRACTORS as f32).
    position: f32,
    /// Velocity in note-space units per simulation tick.
    velocity: f32,
}

/// Gravity Sequencer node.
///
/// ## Parameters
/// - `gravity` — Gravitational strength (default 1.0, range 0.01..10).
/// - `num_particles` — Number of active particles (default 4, range 1..16).
/// - `scale` — Scale index for attractor mapping (default 0 = chromatic, range 0..11).
///
/// ## Inputs
/// - `[0]` clock input: rising edge triggers the next note output.
///
/// ## Outputs
/// - `[0]` pitch output: MIDI note number of the closest attractor to the nearest particle.
/// - `[1]` gate trigger: 1.0 when triggered, 0.0 otherwise.
pub struct GravitySequencer {
    /// The particles in the simulation.
    particles: [Particle; MAX_PARTICLES],
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Current pitch output value.
    pitch_value: f32,
    /// Current gate output value.
    gate_value: f32,
    /// Simple PRNG state (xorshift32).
    rng_state: u32,
    /// Samples since last trigger (for gate timing).
    samples_since_trigger: u64,
    /// Gate duration in samples.
    gate_duration: u64,
}

impl GravitySequencer {
    pub fn new() -> Self {
        let mut seq = Self {
            particles: core::array::from_fn(|_| Particle {
                position: 0.0,
                velocity: 0.0,
            }),
            clock_was_high: false,
            pitch_value: 60.0,
            gate_value: 0.0,
            rng_state: 0x12345678,
            samples_since_trigger: 0,
            gate_duration: 4800,
        };
        // Initialize particles at random positions.
        for i in 0..MAX_PARTICLES {
            seq.particles[i].position = seq.next_random_f32() * NUM_ATTRACTORS as f32;
            seq.particles[i].velocity = (seq.next_random_f32() - 0.5) * 0.5;
        }
        seq
    }

    /// Simple xorshift32 PRNG. Returns the next random u32.
    fn next_random_u32(&mut self) -> u32 {
        let mut x = self.rng_state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng_state = x;
        x
    }

    /// Returns a random f32 in [0, 1).
    fn next_random_f32(&mut self) -> f32 {
        (self.next_random_u32() & 0x7FFFFF) as f32 / 0x800000 as f32
    }

    /// Run one simulation tick: apply gravity toward attractors, update positions.
    fn simulate_tick(&mut self, gravity: f32, num_particles: usize) {
        let n = num_particles.min(MAX_PARTICLES);
        let num_att = NUM_ATTRACTORS as f32;

        for i in 0..n {
            // Find the nearest attractor (integer positions 0..NUM_ATTRACTORS-1).
            let pos = self.particles[i].position;
            let nearest = pos.round().clamp(0.0, num_att - 1.0);

            // Apply gravitational force toward the nearest attractor.
            let distance = nearest - pos;
            let force = if distance.abs() > 0.001 {
                gravity * distance.signum() / (distance.abs().max(0.1))
            } else {
                0.0
            };

            self.particles[i].velocity += force * 0.01;
            // Damping to prevent runaway.
            self.particles[i].velocity *= 0.98;
            self.particles[i].position += self.particles[i].velocity;

            // Bounce off boundaries.
            if self.particles[i].position < 0.0 {
                self.particles[i].position = -self.particles[i].position;
                self.particles[i].velocity = -self.particles[i].velocity * 0.8;
            }
            if self.particles[i].position >= num_att {
                self.particles[i].position = 2.0 * num_att - self.particles[i].position - 0.01;
                self.particles[i].velocity = -self.particles[i].velocity * 0.8;
            }

            // Clamp to valid range.
            self.particles[i].position = self.particles[i].position.clamp(0.0, num_att - 0.01);
        }
    }

    /// Find the pitch of the attractor closest to the nearest particle.
    fn closest_attractor_pitch(&self, num_particles: usize, scale_idx: usize) -> f32 {
        let n = num_particles.min(MAX_PARTICLES);
        if n == 0 {
            return CHROMATIC_BASE;
        }

        // Find the particle closest to any integer attractor.
        let mut best_dist = f32::MAX;
        let mut best_attractor = 0_usize;

        for i in 0..n {
            let pos = self.particles[i].position;
            let nearest = pos.round() as usize;
            let nearest = nearest.min(NUM_ATTRACTORS - 1);
            let dist = (pos - nearest as f32).abs();
            if dist < best_dist {
                best_dist = dist;
                best_attractor = nearest;
            }
        }

        // Map attractor index to MIDI note via the selected scale.
        let scale = &SCALES[scale_idx.min(SCALES.len() - 1)];
        let note_offset = scale[best_attractor.min(scale.len() - 1)];
        CHROMATIC_BASE + note_offset as f32
    }
}

impl Default for GravitySequencer {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for GravitySequencer {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let gravity = ctx.parameters.get("gravity").unwrap_or(1.0).clamp(0.01, 10.0);
        let num_particles = (ctx.parameters.get("num_particles").unwrap_or(4.0) as usize).clamp(1, MAX_PARTICLES);
        let scale_idx = (ctx.parameters.get("scale").unwrap_or(0.0) as usize).min(SCALES.len() - 1);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_clock = !ctx.inputs.is_empty();
        let has_gate_output = ctx.outputs.len() > 1;

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            // Detect rising edge of clock.
            if clock && !self.clock_was_high {
                // Run the physics simulation.
                self.simulate_tick(gravity, num_particles);

                // Output the closest attractor's pitch.
                self.pitch_value = self.closest_attractor_pitch(num_particles, scale_idx);
                self.gate_value = 1.0;
                self.samples_since_trigger = 0;

                // Set gate duration to ~100ms.
                self.gate_duration = (ctx.sample_rate * 0.1) as u64;
            }
            self.clock_was_high = clock;

            // Close the gate after duration.
            if self.samples_since_trigger >= self.gate_duration {
                self.gate_value = 0.0;
            }

            ctx.outputs[0][i] = super::midi_to_hz(self.pitch_value);
            if has_gate_output {
                ctx.outputs[1][i] = self.gate_value;
            }

            self.samples_since_trigger += 1;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.clock_was_high = false;
        self.pitch_value = 60.0;
        self.gate_value = 0.0;
        self.samples_since_trigger = 0;
        // Re-initialize particles.
        for i in 0..MAX_PARTICLES {
            self.particles[i].position = self.next_random_f32() * NUM_ATTRACTORS as f32;
            self.particles[i].velocity = (self.next_random_f32() - 0.5) * 0.5;
        }
    }
}
