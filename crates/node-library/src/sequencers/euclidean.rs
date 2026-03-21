//! Euclidean rhythm generator node.
//!
//! Generates rhythmic trigger patterns using the Euclidean algorithm (Bjorklund's algorithm).
//! E(k, n) distributes k pulses as evenly as possible over n steps.
//! For example, E(3, 8) = [1, 0, 0, 1, 0, 0, 1, 0].

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum number of steps in a Euclidean pattern.
const MAX_STEPS: usize = 64;

/// Euclidean rhythm generator node.
///
/// ## Parameters
/// - `steps` — Total number of steps in the pattern (default 8, range 1..64).
/// - `pulses` — Number of active pulses (default 3, range 0..steps).
/// - `rotation` — Pattern rotation in steps (default 0, range 0..steps-1).
///
/// ## Inputs
/// - `[0]` clock input: rising edge (crossing above 0.5) triggers the next step.
///
/// ## Outputs
/// - `[0]` trigger output: 1.0 on active steps, 0.0 on inactive steps.
pub struct EuclideanNode {
    /// The computed pattern (true = pulse, false = rest).
    pattern: [bool; MAX_STEPS],
    /// Current step index in the pattern.
    current_step: usize,
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Cached parameter values for recomputation detection.
    cached_steps: u32,
    cached_pulses: u32,
    cached_rotation: u32,
    /// Current trigger output value.
    trigger_value: f32,
}

impl EuclideanNode {
    pub fn new() -> Self {
        let mut node = Self {
            pattern: [false; MAX_STEPS],
            current_step: 0,
            clock_was_high: false,
            cached_steps: 0,
            cached_pulses: 0,
            cached_rotation: 0,
            trigger_value: 0.0,
        };
        // Compute the default pattern E(3, 8).
        node.compute_pattern(8, 3, 0);
        node
    }

    /// Compute the Euclidean pattern using Bjorklund's algorithm.
    fn compute_pattern(&mut self, steps: u32, pulses: u32, rotation: u32) {
        let steps = (steps as usize).clamp(1, MAX_STEPS);
        let pulses = (pulses as usize).min(steps);
        let rotation = rotation as usize % steps;

        self.cached_steps = steps as u32;
        self.cached_pulses = pulses as u32;
        self.cached_rotation = rotation as u32;

        // Clear the pattern.
        for p in &mut self.pattern {
            *p = false;
        }

        if pulses == 0 {
            return;
        }
        if pulses >= steps {
            // All steps are pulses.
            for p in self.pattern.iter_mut().take(steps) {
                *p = true;
            }
            return;
        }

        // Bjorklund's algorithm.
        // Build the pattern by distributing pulses evenly.
        let mut pattern_vec = vec![false; steps];
        euclidean_bjorklund(&mut pattern_vec, pulses);

        // Apply rotation.
        for i in 0..steps {
            let rotated_idx = (i + rotation) % steps;
            self.pattern[i] = pattern_vec[rotated_idx];
        }
    }
}

/// Bjorklund's algorithm for computing Euclidean rhythms.
/// Distributes `pulses` evenly across `pattern.len()` steps.
///
/// This produces the standard Bjorklund output where E(3,8) = [1,0,0,1,0,0,1,0].
fn euclidean_bjorklund(pattern: &mut [bool], pulses: usize) {
    let n = pattern.len();
    if n == 0 || pulses == 0 {
        return;
    }
    if pulses >= n {
        for p in pattern.iter_mut() {
            *p = true;
        }
        return;
    }

    // Bjorklund's algorithm using the iterative grouping approach.
    // Start with `pulses` groups of [1] and `n - pulses` groups of [0].
    // Repeatedly distribute the remainder groups onto the main groups
    // until at most one remainder group is left.

    // We use a flat buffer and track group boundaries.
    // sequence stores the pattern being built.
    let mut sequence: Vec<bool> = Vec::with_capacity(n);
    // Start: k ones followed by (n-k) zeros.
    sequence.extend(std::iter::repeat_n(true, pulses));
    sequence.extend(std::iter::repeat_n(false, n - pulses));

    // Track group sizes: initially `pulses` groups of size 1, and `n-pulses` remainder of size 1.
    let mut num_groups = pulses;
    let mut num_remainder = n - pulses;
    let mut group_size = 1_usize;
    let mut remainder_size = 1_usize;

    while num_remainder > 1 {
        // Append one remainder element to each group (or as many as we have).
        let distribute = num_groups.min(num_remainder);

        // Build new sequence by interleaving.
        let mut new_seq: Vec<bool> = Vec::with_capacity(n);
        let mut pos = 0;
        for i in 0..num_groups {
            // Copy one group.
            for j in 0..group_size {
                new_seq.push(sequence[pos + j]);
            }
            pos += group_size;
            // Append one remainder if available.
            if i < distribute {
                let rem_start = num_groups * group_size + i * remainder_size;
                for j in 0..remainder_size {
                    new_seq.push(sequence[rem_start + j]);
                }
            }
        }
        // Copy remaining remainder groups that weren't distributed.
        let distributed_remainder_elements = distribute * remainder_size;
        let remaining_start = num_groups * group_size + distributed_remainder_elements;
        for item in sequence.iter().take(n).skip(remaining_start) {
            new_seq.push(*item);
        }

        sequence = new_seq;

        // Update group tracking.
        let new_group_size = group_size + remainder_size;
        let new_num_groups = distribute;
        let leftover_groups = num_groups - distribute;
        let leftover_remainder = num_remainder - distribute;

        // The new remainder is the leftover original groups (size group_size)
        // plus leftover remainder groups (size remainder_size).
        // But they might have different sizes... The simpler approach:
        // After distribution: `distribute` groups of size (group_size + remainder_size),
        // plus (num_groups - distribute) groups of size group_size (if any),
        // plus (num_remainder - distribute) groups of size remainder_size (if any).
        // The "main" groups are the `distribute` ones, the remainder is the rest.

        num_remainder = leftover_groups + leftover_remainder;
        num_groups = new_num_groups;

        if leftover_groups > 0 {
            remainder_size = group_size;
        }
        // If only leftover_remainder > 0, remainder_size stays the same.
        group_size = new_group_size;
    }

    // Copy result to output pattern.
    for (i, &val) in sequence.iter().enumerate().take(n) {
        pattern[i] = val;
    }
}

impl Default for EuclideanNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for EuclideanNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let steps = (ctx.parameters.get("steps").unwrap_or(8.0) as u32).clamp(1, MAX_STEPS as u32);
        let pulses = (ctx.parameters.get("pulses").unwrap_or(3.0) as u32).min(steps);
        let rotation = (ctx.parameters.get("rotation").unwrap_or(0.0) as u32) % steps;

        // Recompute pattern if parameters changed.
        if steps != self.cached_steps || pulses != self.cached_pulses || rotation != self.cached_rotation {
            self.compute_pattern(steps, pulses, rotation);
        }

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let has_clock = !ctx.inputs.is_empty();
        let output = &mut ctx.outputs[0];

        let n = steps as usize;

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            // Detect rising edge of clock.
            if clock && !self.clock_was_high {
                // Advance to next step and output trigger based on pattern.
                self.trigger_value = if self.pattern[self.current_step] {
                    1.0
                } else {
                    0.0
                };
                self.current_step = (self.current_step + 1) % n;
            }
            self.clock_was_high = clock;

            output[i] = self.trigger_value;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.current_step = 0;
        self.clock_was_high = false;
        self.trigger_value = 0.0;
    }
}
