//! Quantizer node — snaps a control signal to the nearest note in a musical scale.
//!
//! Input is expected in semitone units (e.g., MIDI note numbers or a continuous
//! pitch signal). Output is the quantized value snapped to the nearest degree
//! of the selected scale.

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

/// Available musical scales.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scale {
    /// All 12 semitones.
    Chromatic,
    /// Major scale: W-W-H-W-W-W-H (intervals: 0,2,4,5,7,9,11).
    Major,
    /// Natural minor scale: W-H-W-W-H-W-W (intervals: 0,2,3,5,7,8,10).
    Minor,
    /// Major pentatonic: (intervals: 0,2,4,7,9).
    Pentatonic,
}

impl Scale {
    /// Parse from a float parameter: 0=chromatic, 1=major, 2=minor, 3=pentatonic.
    fn from_param(v: f32) -> Self {
        match v as u32 {
            0 => Self::Chromatic,
            1 => Self::Major,
            2 => Self::Minor,
            3 => Self::Pentatonic,
            _ => Self::Chromatic,
        }
    }

    /// Get the scale degrees (semitone offsets within one octave).
    fn degrees(&self) -> &'static [u8] {
        match self {
            Self::Chromatic => &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            Self::Major => &[0, 2, 4, 5, 7, 9, 11],
            Self::Minor => &[0, 2, 3, 5, 7, 8, 10],
            Self::Pentatonic => &[0, 2, 4, 7, 9],
        }
    }
}

/// Quantizer node.
///
/// ## Parameters
/// - `scale` — 0=chromatic, 1=major, 2=minor, 3=pentatonic (default 0).
/// - `root` — Root note as semitone offset 0..11 (default 0 = C).
///
/// ## Inputs
/// - `[0]` pitch input in semitones (e.g., MIDI note number or continuous pitch).
///
/// ## Outputs
/// - `[0]` quantized pitch output in semitones.
pub struct QuantizerNode;

impl QuantizerNode {
    pub fn new() -> Self {
        Self
    }
}

impl Default for QuantizerNode {
    fn default() -> Self {
        Self::new()
    }
}

/// Quantize a pitch value (in semitones) to the nearest note in the given scale.
#[inline]
fn quantize_to_scale(pitch: f32, scale: Scale, root: f32) -> f32 {
    let degrees = scale.degrees();

    // If chromatic, just round to nearest integer.
    if scale == Scale::Chromatic {
        return pitch.round();
    }

    let root = root as i32;
    // Shift pitch relative to root.
    let shifted = pitch - root as f32;

    // Find the octave and position within the octave.
    let octave = shifted.floor() as i32 / 12;
    let mut semitone_in_octave = shifted - (octave * 12) as f32;

    // Handle negative values properly.
    if semitone_in_octave < 0.0 {
        semitone_in_octave += 12.0;
    }

    // Find the nearest scale degree.
    let mut best_degree = degrees[0];
    let mut best_distance = f32::MAX;
    for &degree in degrees {
        let distance = (semitone_in_octave - degree as f32).abs();
        if distance < best_distance {
            best_distance = distance;
            best_degree = degree;
        }
        // Also check wrapping around the octave (e.g., 11.5 is closer to 0 in next octave).
        let wrap_distance = (semitone_in_octave - (degree as f32 + 12.0)).abs();
        if wrap_distance < best_distance {
            best_distance = wrap_distance;
            best_degree = degree;
            // This note is in the next octave, will be handled by the +12 below.
        }
    }

    // Reconstruct the quantized pitch.
    let quantized_in_octave = best_degree as f32;
    let mut result = (octave * 12) as f32 + quantized_in_octave + root as f32;

    // Handle the case where we wrapped to the next octave.
    // If the original semitone was closer to a degree in the next octave, adjust.
    let distance_current = (shifted - ((octave * 12) as f32 + quantized_in_octave)).abs();
    let distance_next = (shifted - ((octave * 12) as f32 + quantized_in_octave + 12.0)).abs();
    let distance_prev = (shifted - ((octave * 12) as f32 + quantized_in_octave - 12.0)).abs();

    if distance_next < distance_current {
        result += 12.0;
    } else if distance_prev < distance_current {
        result -= 12.0;
    }

    result
}

impl AudioNode for QuantizerNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let scale = Scale::from_param(ctx.parameters.get("scale").unwrap_or(0.0));
        let root = (ctx.parameters.get("root").unwrap_or(0.0)).clamp(0.0, 11.0);

        if ctx.inputs.is_empty() || ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Silent);
        }

        let input = ctx.inputs[0];
        let output = &mut ctx.outputs[0];

        for i in 0..ctx.buffer_size {
            output[i] = quantize_to_scale(input[i], scale, root);
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        // Stateless node — nothing to reset.
    }
}
