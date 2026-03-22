//! Game of Life Sequencer node.
//!
//! Runs Conway's Game of Life on a 2D grid where each column represents a
//! time step and each row represents a pitch. On each clock trigger, advances
//! one generation and scans the current column for live cells, outputting the
//! lowest live cell's pitch as a MIDI note number.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Maximum grid dimensions.
const MAX_WIDTH: usize = 32;
const MAX_HEIGHT: usize = 16;

/// Game of Life Sequencer node.
///
/// ## Parameters
/// - `width` — Grid width / number of columns (default 16, range 4..32).
/// - `height` — Grid height / number of rows (default 8, range 4..16).
/// - `density` — Initial random fill density (default 0.3, range 0..1).
///
/// ## Inputs
/// - `[0]` clock input: rising edge triggers the next generation.
///
/// ## Outputs
/// - `[0]` pitch output: MIDI note of the lowest live cell in the current column.
/// - `[1]` gate trigger: 1.0 when a live cell is found, 0.0 otherwise.
pub struct GameOfLifeSequencer {
    /// The current grid state. grid[row][col] = true means cell is alive.
    grid: [[bool; MAX_WIDTH]; MAX_HEIGHT],
    /// Scratch buffer for computing the next generation.
    scratch: [[bool; MAX_WIDTH]; MAX_HEIGHT],
    /// Current column index being read.
    current_column: usize,
    /// Whether the clock was high on the previous sample (for edge detection).
    clock_was_high: bool,
    /// Current pitch output value.
    pitch_value: f32,
    /// Current gate output value.
    gate_value: f32,
    /// Samples since last trigger (for gate timing).
    samples_since_trigger: u64,
    /// Gate duration in samples.
    gate_duration: u64,
    /// Simple PRNG state (xorshift32).
    rng_state: u32,
    /// Whether the grid has been initialized.
    initialized: bool,
    /// Cached density parameter to detect changes for re-init.
    cached_density: f32,
}

impl GameOfLifeSequencer {
    pub fn new() -> Self {
        let mut seq = Self {
            grid: [[false; MAX_WIDTH]; MAX_HEIGHT],
            scratch: [[false; MAX_WIDTH]; MAX_HEIGHT],
            current_column: 0,
            clock_was_high: false,
            pitch_value: 60.0,
            gate_value: 0.0,
            samples_since_trigger: 0,
            gate_duration: 4800,
            rng_state: 0xDEADBEEF,
            initialized: false,
            cached_density: 0.3,
        };
        seq.randomize_grid(16, 8, 0.3);
        seq.initialized = true;
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

    /// Fill the grid randomly based on density.
    fn randomize_grid(&mut self, width: usize, height: usize, density: f32) {
        for row in 0..MAX_HEIGHT {
            for col in 0..MAX_WIDTH {
                if row < height && col < width {
                    self.grid[row][col] = self.next_random_f32() < density;
                } else {
                    self.grid[row][col] = false;
                }
            }
        }
    }

    /// Advance one generation of Conway's Game of Life.
    fn advance_generation(&mut self, width: usize, height: usize) {
        for row in 0..height {
            for col in 0..width {
                let neighbors = self.count_neighbors(row, col, width, height);
                self.scratch[row][col] = if self.grid[row][col] {
                    // Live cell survives with 2 or 3 neighbors.
                    neighbors == 2 || neighbors == 3
                } else {
                    // Dead cell becomes alive with exactly 3 neighbors.
                    neighbors == 3
                };
            }
        }
        // Copy scratch back to grid.
        for row in 0..height {
            for col in 0..width {
                self.grid[row][col] = self.scratch[row][col];
            }
        }
    }

    /// Count live neighbors of a cell (with wrapping at boundaries).
    fn count_neighbors(&self, row: usize, col: usize, width: usize, height: usize) -> u8 {
        let mut count = 0u8;
        for dr in [-1_i32, 0, 1] {
            for dc in [-1_i32, 0, 1] {
                if dr == 0 && dc == 0 {
                    continue;
                }
                let nr = ((row as i32 + dr).rem_euclid(height as i32)) as usize;
                let nc = ((col as i32 + dc).rem_euclid(width as i32)) as usize;
                if self.grid[nr][nc] {
                    count += 1;
                }
            }
        }
        count
    }

    /// Scan the current column for live cells. Return the pitch of the lowest live cell.
    /// If no cells are alive, re-seed the grid and return a default pitch.
    fn scan_column_for_pitch(
        &mut self,
        column: usize,
        width: usize,
        height: usize,
        density: f32,
    ) -> (f32, bool) {
        // Find the lowest live cell in this column.
        for row in 0..height {
            if self.grid[row][column % width] {
                // Map row to MIDI note: row 0 = C4 (60), each row up = +1 semitone.
                let pitch = 60.0 + row as f32;
                return (pitch, true);
            }
        }

        // No live cells found in this column. Check if the entire grid is dead.
        let mut any_alive = false;
        for row in 0..height {
            for col in 0..width {
                if self.grid[row][col] {
                    any_alive = true;
                    break;
                }
            }
            if any_alive {
                break;
            }
        }

        // If the whole grid is dead, re-seed it.
        if !any_alive {
            self.randomize_grid(width, height, density);
        }

        (60.0, false) // No note for this column.
    }
}

impl Default for GameOfLifeSequencer {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for GameOfLifeSequencer {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let width = (ctx.parameters.get("width").unwrap_or(16.0) as usize).clamp(4, MAX_WIDTH);
        let height = (ctx.parameters.get("height").unwrap_or(8.0) as usize).clamp(4, MAX_HEIGHT);
        let density = ctx.parameters.get("density").unwrap_or(0.3).clamp(0.0, 1.0);

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        // Re-initialize if density parameter changed significantly.
        if (density - self.cached_density).abs() > 0.05 {
            self.randomize_grid(width, height, density);
            self.cached_density = density;
            self.current_column = 0;
        }

        let has_clock = !ctx.inputs.is_empty();
        let has_gate_output = ctx.outputs.len() > 1;

        for i in 0..ctx.buffer_size {
            let clock = if has_clock { ctx.inputs[0][i] > 0.5 } else { false };

            // Detect rising edge of clock.
            if clock && !self.clock_was_high {
                // Advance one generation.
                self.advance_generation(width, height);

                // Scan the current column for pitch.
                let (pitch, has_note) =
                    self.scan_column_for_pitch(self.current_column, width, height, density);

                self.pitch_value = pitch;
                self.gate_value = if has_note { 1.0 } else { 0.0 };
                self.samples_since_trigger = 0;
                self.gate_duration = (ctx.sample_rate * 0.1) as u64;

                // Advance column.
                self.current_column = (self.current_column + 1) % width;
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
        self.current_column = 0;
        self.clock_was_high = false;
        self.pitch_value = 60.0;
        self.gate_value = 0.0;
        self.samples_since_trigger = 0;
        self.initialized = false;
        self.randomize_grid(16, 8, self.cached_density);
        self.initialized = true;
    }
}
