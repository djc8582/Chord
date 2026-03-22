//! Tests for all Wave 1, 2, and 3 nodes.

use chord_dsp_runtime::{
    AudioNode, MidiMessage, NodeParameterState, ProcessContext, ProcessStatus, TransportState,
};

use crate::{
    AdsrEnvelope, BiquadFilter, Chorus, CompressorNode, CrossFader, DCBlocker, DelayNode, EqNode,
    EuclideanNode, GainNode, Gate, GranularNode, Lfo, Limiter, MidiToFreq, MixerNode, NoiseNode,
    NodeRegistry, Oscillator, OutputNode, Phaser, PitchShifter, QuantizerNode, ReverbNode,
    ConvolutionReverb, RingModulator, SampleAndHoldNode, SpectralNode, Stereo, Vocoder, Waveshaper,
};

// ─── Test helpers ───────────────────────────────────────────────────────────

const SAMPLE_RATE: f64 = 48000.0;
const BUFFER_SIZE: usize = 256;

/// Create a simple ProcessContext with the given number of input and output ports.
/// Returns (inputs_storage, outputs_storage, params, transport, midi_input, midi_output)
/// so that the caller can build the ProcessContext from references.
struct TestContext {
    input_buffers: Vec<Vec<f32>>,
    output_buffers: Vec<Vec<f32>>,
    params: NodeParameterState,
    transport: TransportState,
    midi_input: Vec<MidiMessage>,
    midi_output: Vec<MidiMessage>,
}

impl TestContext {
    fn new(num_inputs: usize, num_outputs: usize) -> Self {
        Self {
            input_buffers: (0..num_inputs)
                .map(|_| vec![0.0f32; BUFFER_SIZE])
                .collect(),
            output_buffers: (0..num_outputs)
                .map(|_| vec![0.0f32; BUFFER_SIZE])
                .collect(),
            params: NodeParameterState::new(),
            transport: TransportState::new(SAMPLE_RATE),
            midi_input: Vec::new(),
            midi_output: Vec::new(),
        }
    }

    fn with_param(mut self, name: &str, value: f32) -> Self {
        self.params.set(name, value, 0);
        self
    }

    fn with_midi(mut self, messages: Vec<MidiMessage>) -> Self {
        self.midi_input = messages;
        self
    }

    /// Process a node with this context and return the result.
    fn process(&mut self, node: &mut dyn AudioNode) -> Result<ProcessStatus, chord_dsp_runtime::AudioError> {
        // Build input references.
        let input_refs: Vec<&[f32]> = self.input_buffers.iter().map(|b| b.as_slice()).collect();
        // Build output references.
        let mut output_refs: Vec<&mut [f32]> = self
            .output_buffers
            .iter_mut()
            .map(|b| b.as_mut_slice())
            .collect();

        let mut ctx = ProcessContext {
            inputs: &input_refs,
            outputs: &mut output_refs,
            parameters: &self.params,
            sample_rate: SAMPLE_RATE,
            buffer_size: BUFFER_SIZE,
            transport: &self.transport,
            midi_input: &self.midi_input,
            midi_output: &mut self.midi_output,
        };

        node.process(&mut ctx)
    }

    /// Get output buffer for a given port index.
    fn output(&self, port: usize) -> &[f32] {
        &self.output_buffers[port]
    }

    /// Set input buffer data.
    fn set_input(&mut self, port: usize, data: &[f32]) {
        self.input_buffers[port][..data.len()].copy_from_slice(data);
    }

    /// Fill input with a constant value.
    fn fill_input(&mut self, port: usize, value: f32) {
        for s in &mut self.input_buffers[port] {
            *s = value;
        }
    }
}

// ─── Oscillator tests ───────────────────────────────────────────────────────

#[test]
fn test_oscillator_sine_440hz() {
    let mut osc = Oscillator::new();
    let mut tc = TestContext::new(0, 1).with_param("frequency", 440.0).with_param("waveform", 0.0);

    let status = tc.process(&mut osc).unwrap();
    assert_eq!(status, ProcessStatus::Ok);

    let output = tc.output(0);

    // A 440Hz sine at 48kHz has a period of ~109.09 samples.
    // Check that the first sample is near 0 (sine starts at 0).
    assert!(
        output[0].abs() < 0.1,
        "Sine should start near 0, got {}",
        output[0]
    );

    // Find the approximate peak (should be around sample 27, which is ~1/4 period).
    let quarter_period = (SAMPLE_RATE / 440.0 / 4.0) as usize;
    let peak_sample = output[quarter_period];
    assert!(
        peak_sample > 0.9,
        "Sine peak should be near 1.0, got {} at sample {}",
        peak_sample,
        quarter_period
    );

    // Check that output contains both positive and negative values.
    let has_positive = output.iter().any(|&s| s > 0.5);
    let has_negative = output.iter().any(|&s| s < -0.5);
    assert!(has_positive, "Sine output should have positive values");
    assert!(has_negative, "Sine output should have negative values");
}

#[test]
fn test_oscillator_saw_waveform() {
    let mut osc = Oscillator::new();
    // Use a higher frequency so we get a full period in 256 samples.
    let mut tc = TestContext::new(0, 1).with_param("frequency", 500.0).with_param("waveform", 1.0);

    tc.process(&mut osc).unwrap();
    let output = tc.output(0);

    // Saw wave should sweep from -1 to +1 over a period.
    // At 500Hz / 48kHz, one period is ~96 samples, so 256 samples gives ~2.67 periods.
    let has_positive = output.iter().any(|&s| s > 0.5);
    let has_negative = output.iter().any(|&s| s < -0.5);
    assert!(has_positive, "Saw should have positive values");
    assert!(has_negative, "Saw should have negative values");
}

#[test]
fn test_oscillator_square_waveform() {
    let mut osc = Oscillator::new();
    let mut tc = TestContext::new(0, 1).with_param("frequency", 100.0).with_param("waveform", 2.0);

    tc.process(&mut osc).unwrap();
    let output = tc.output(0);

    // Square wave should be mostly near +1 or -1 (with PolyBLEP transitions).
    let near_one = output.iter().filter(|&&s| (s.abs() - 1.0).abs() < 0.2).count();
    assert!(
        near_one > BUFFER_SIZE / 2,
        "Square wave should be mostly near +/-1, but only {near_one}/{BUFFER_SIZE} samples are"
    );
}

#[test]
fn test_oscillator_triangle_waveform() {
    let mut osc = Oscillator::new();
    let mut tc = TestContext::new(0, 1).with_param("frequency", 100.0).with_param("waveform", 3.0);

    tc.process(&mut osc).unwrap();
    let output = tc.output(0);

    // Triangle should range from -1 to +1.
    let max = output.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let min = output.iter().copied().fold(f32::INFINITY, f32::min);
    assert!(max > 0.9, "Triangle max should be near 1.0, got {max}");
    assert!(min < -0.9, "Triangle min should be near -1.0, got {min}");
}

#[test]
fn test_oscillator_detune() {
    let mut osc1 = Oscillator::new();
    let mut osc2 = Oscillator::new();

    let mut tc1 = TestContext::new(0, 1)
        .with_param("frequency", 440.0)
        .with_param("detune", 0.0)
        .with_param("waveform", 0.0);
    let mut tc2 = TestContext::new(0, 1)
        .with_param("frequency", 440.0)
        .with_param("detune", 1200.0) // +1200 cents = one octave up = 880Hz
        .with_param("waveform", 0.0);

    tc1.process(&mut osc1).unwrap();
    tc2.process(&mut osc2).unwrap();

    // With 1200 cents detune, the frequency doubles to 880Hz.
    // At 880Hz the period is about half that of 440Hz.
    // Count zero crossings (positive→negative transitions).
    let crossings_1 = count_zero_crossings(tc1.output(0));
    let crossings_2 = count_zero_crossings(tc2.output(0));

    // 880Hz should have roughly double the zero crossings of 440Hz.
    assert!(
        crossings_2 > crossings_1,
        "Detuned osc should have more zero crossings: {} vs {}",
        crossings_2,
        crossings_1
    );
}

#[test]
fn test_oscillator_fm_input() {
    let mut osc = Oscillator::new();
    let mut tc = TestContext::new(1, 1)
        .with_param("frequency", 440.0)
        .with_param("waveform", 0.0);
    // Add 440Hz via FM input, effectively doubling to 880Hz.
    tc.fill_input(0, 440.0);

    tc.process(&mut osc).unwrap();
    let output = tc.output(0);

    // Should have more zero crossings than a plain 440Hz oscillator.
    let crossings = count_zero_crossings(output);
    // At 880Hz in 256 samples at 48kHz, we expect about 2 * 256 * 880 / 48000 ≈ 9.4
    // so roughly 9 crossings. A 440Hz osc would have about 4-5.
    assert!(crossings >= 7, "FM'd oscillator should have more zero crossings, got {crossings}");
}

#[test]
fn test_oscillator_reset() {
    let mut osc = Oscillator::new();
    let mut tc = TestContext::new(0, 1).with_param("frequency", 440.0).with_param("waveform", 0.0);

    // Process a buffer.
    tc.process(&mut osc).unwrap();
    let output_before = tc.output(0).to_vec();

    // Reset and process again — should produce identical output.
    osc.reset();
    let mut tc2 = TestContext::new(0, 1).with_param("frequency", 440.0).with_param("waveform", 0.0);
    tc2.process(&mut osc).unwrap();
    let output_after = tc2.output(0);

    assert_eq!(
        output_before, output_after,
        "Oscillator should produce identical output after reset"
    );
}

// ─── Filter tests ───────────────────────────────────────────────────────────

#[test]
fn test_filter_lowpass_removes_high_freq() {
    // Generate a mix of 100Hz + 10kHz sine, then low-pass at 500Hz.
    // The output should have much less high-frequency content.
    let mut osc_low = Oscillator::new();
    let mut osc_high = Oscillator::new();
    let mut filter = BiquadFilter::new();

    // Generate 100Hz sine.
    let mut tc_low = TestContext::new(0, 1).with_param("frequency", 100.0).with_param("waveform", 0.0);
    tc_low.process(&mut osc_low).unwrap();

    // Generate 10kHz sine.
    let mut tc_high = TestContext::new(0, 1).with_param("frequency", 10000.0).with_param("waveform", 0.0);
    tc_high.process(&mut osc_high).unwrap();

    // Mix them together.
    let mut mixed = vec![0.0f32; BUFFER_SIZE];
    for (i, m) in mixed.iter_mut().enumerate().take(BUFFER_SIZE) {
        *m = tc_low.output(0)[i] + tc_high.output(0)[i];
    }

    // Apply low-pass filter at 500Hz.
    let mut filter_tc = TestContext::new(1, 1)
        .with_param("cutoff", 500.0)
        .with_param("resonance", 0.707)
        .with_param("mode", 0.0); // low-pass
    filter_tc.set_input(0, &mixed);

    // Run the filter several times to let it settle.
    for _ in 0..4 {
        filter_tc.process(&mut filter).unwrap();
    }

    let output = filter_tc.output(0);

    // Calculate RMS of the filter output vs. the unfiltered high-frequency component.
    let rms_output = rms(output);
    let rms_high = rms(tc_high.output(0));

    // The output should be significantly lower than the high-frequency component alone,
    // because the LP filter attenuates 10kHz heavily at 500Hz cutoff.
    assert!(
        rms_output < rms_high,
        "Low-pass filter should reduce high freq: output_rms={rms_output}, high_rms={rms_high}"
    );
}

#[test]
fn test_filter_highpass_removes_low_freq() {
    // Generate 100Hz signal, high-pass at 5kHz.
    let mut osc = Oscillator::new();
    let mut filter = BiquadFilter::new();

    let mut tc_osc = TestContext::new(0, 1).with_param("frequency", 100.0).with_param("waveform", 0.0);
    tc_osc.process(&mut osc).unwrap();

    let mut filter_tc = TestContext::new(1, 1)
        .with_param("cutoff", 5000.0)
        .with_param("resonance", 0.707)
        .with_param("mode", 1.0); // high-pass
    filter_tc.set_input(0, tc_osc.output(0));

    // Run several times to let filter settle.
    for _ in 0..8 {
        filter_tc.process(&mut filter).unwrap();
    }

    let rms_out = rms(filter_tc.output(0));
    let rms_in = rms(tc_osc.output(0));

    // The output RMS should be much less than input (100Hz attenuated by HP at 5kHz).
    assert!(
        rms_out < rms_in * 0.3,
        "High-pass should attenuate 100Hz: out_rms={rms_out}, in_rms={rms_in}"
    );
}

#[test]
fn test_filter_stable_at_high_resonance() {
    let mut filter = BiquadFilter::new();
    let mut tc = TestContext::new(1, 1)
        .with_param("cutoff", 1000.0)
        .with_param("resonance", 20.0) // Very high Q.
        .with_param("mode", 0.0);

    // Feed an impulse.
    tc.input_buffers[0][0] = 1.0;

    // Process many buffers — should not produce NaN or infinity.
    for _ in 0..100 {
        tc.process(&mut filter).unwrap();
        for &s in tc.output(0) {
            assert!(s.is_finite(), "Filter output should be finite at high resonance");
        }
        // Clear input after impulse.
        tc.fill_input(0, 0.0);
    }
}

#[test]
fn test_filter_reset() {
    let mut filter = BiquadFilter::new();
    let mut tc = TestContext::new(1, 1)
        .with_param("cutoff", 1000.0)
        .with_param("resonance", 0.707)
        .with_param("mode", 0.0);

    tc.input_buffers[0][0] = 1.0;
    tc.process(&mut filter).unwrap();

    filter.reset();

    // After reset, processing silence should produce silence.
    tc.fill_input(0, 0.0);
    tc.process(&mut filter).unwrap();

    // All output should be zero or negligible (filter state was cleared).
    let max_abs = tc.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(
        max_abs < 1e-6,
        "Filter output after reset+silence should be near zero, got {max_abs}"
    );
}

// ─── Gain tests ─────────────────────────────────────────────────────────────

#[test]
fn test_gain_unity() {
    let mut gain = GainNode::new();
    let mut tc = TestContext::new(1, 1).with_param("gain", 1.0);

    // Fill input with a known pattern.
    for i in 0..BUFFER_SIZE {
        tc.input_buffers[0][i] = (i as f32) / BUFFER_SIZE as f32;
    }

    tc.process(&mut gain).unwrap();

    // Output should equal input at unity gain.
    for i in 0..BUFFER_SIZE {
        assert!(
            (tc.output(0)[i] - tc.input_buffers[0][i]).abs() < 1e-5,
            "Unity gain: output[{i}]={} != input[{i}]={}",
            tc.output(0)[i],
            tc.input_buffers[0][i]
        );
    }
}

#[test]
fn test_gain_half() {
    let mut gain = GainNode::new();
    // Start the smoothed gain at 0.5 by processing once with gain=0.5 to let it settle.
    let mut tc = TestContext::new(1, 1).with_param("gain", 0.5);
    tc.fill_input(0, 0.0);
    // Process once to settle the smoothed parameter.
    tc.process(&mut gain).unwrap();

    // Now process with actual data.
    let mut tc2 = TestContext::new(1, 1).with_param("gain", 0.5);
    for i in 0..BUFFER_SIZE {
        tc2.input_buffers[0][i] = 1.0;
    }
    tc2.process(&mut gain).unwrap();

    // After settling, output should be near 0.5.
    // Check the last quarter of the buffer where smoothing has settled.
    for i in (BUFFER_SIZE * 3 / 4)..BUFFER_SIZE {
        assert!(
            (tc2.output(0)[i] - 0.5).abs() < 0.02,
            "Half gain: output[{i}]={}, expected ~0.5",
            tc2.output(0)[i]
        );
    }
}

#[test]
fn test_gain_zero() {
    let mut gain = GainNode::new();
    // Initialize at zero gain.
    let mut tc_init = TestContext::new(1, 1).with_param("gain", 0.0);
    tc_init.fill_input(0, 0.0);
    tc_init.process(&mut gain).unwrap();

    let mut tc = TestContext::new(1, 1).with_param("gain", 0.0);
    tc.fill_input(0, 1.0);
    tc.process(&mut gain).unwrap();

    // All output should be near zero (allowing for smoothing transient at the start).
    for i in (BUFFER_SIZE / 2)..BUFFER_SIZE {
        assert!(
            tc.output(0)[i].abs() < 0.01,
            "Zero gain: output[{i}]={}, expected ~0",
            tc.output(0)[i]
        );
    }
}

#[test]
fn test_gain_smoothing_no_click() {
    let mut gain = GainNode::new();

    // Start at gain=0.0.
    let mut tc1 = TestContext::new(1, 1).with_param("gain", 0.0);
    tc1.fill_input(0, 1.0);
    tc1.process(&mut gain).unwrap();

    // Jump to gain=1.0.
    let mut tc2 = TestContext::new(1, 1).with_param("gain", 1.0);
    tc2.fill_input(0, 1.0);
    tc2.process(&mut gain).unwrap();

    // Check that no adjacent samples differ by more than a threshold.
    let output = tc2.output(0);
    let mut max_delta: f32 = 0.0;
    for i in 1..BUFFER_SIZE {
        let delta = (output[i] - output[i - 1]).abs();
        if delta > max_delta {
            max_delta = delta;
        }
    }

    // With 64-sample smoothing over a 0→1 jump, max delta ≈ 1/64 ≈ 0.016.
    assert!(
        max_delta < 0.05,
        "Gain smoothing: max_delta={max_delta}, should be small (no click)"
    );
}

// ─── ADSR Envelope tests ───────────────────────────────────────────────────

#[test]
fn test_envelope_idle_when_no_gate() {
    let mut env = AdsrEnvelope::new();
    let mut tc = TestContext::new(1, 1)
        .with_param("attack", 0.01)
        .with_param("decay", 0.1)
        .with_param("sustain", 0.7)
        .with_param("release", 0.3);

    // Gate input is all zeros.
    tc.fill_input(0, 0.0);
    tc.process(&mut env).unwrap();

    // Output should be all zeros.
    for &s in tc.output(0) {
        assert!(s.abs() < 1e-6, "Envelope should be silent without gate, got {s}");
    }
}

#[test]
fn test_envelope_attack_phase() {
    let mut env = AdsrEnvelope::new();
    let attack_time = 0.01; // 10ms
    let mut tc = TestContext::new(1, 1)
        .with_param("attack", attack_time as f32)
        .with_param("decay", 0.1)
        .with_param("sustain", 0.7)
        .with_param("release", 0.3);

    // Gate on for the entire buffer.
    tc.fill_input(0, 1.0);
    tc.process(&mut env).unwrap();

    let output = tc.output(0);

    // The envelope should rise during attack.
    assert!(output[0] > 0.0, "Envelope should start rising immediately");

    // After attack time (480 samples at 48kHz for 10ms), should be at or near 1.0.
    let attack_samples = (attack_time * SAMPLE_RATE) as usize;
    if attack_samples < BUFFER_SIZE {
        assert!(
            output[attack_samples] > 0.95,
            "Envelope should reach peak after attack, got {} at sample {attack_samples}",
            output[attack_samples]
        );
    }
}

#[test]
fn test_envelope_full_adsr_shape() {
    let mut env = AdsrEnvelope::new();
    // Very short times so we can see the full shape in a few buffers.
    let attack = 0.001; // 1ms = 48 samples
    let decay = 0.002; // 2ms = 96 samples
    let sustain = 0.5;
    let release = 0.002; // 2ms = 96 samples

    // Phase 1: Gate on — attack + decay + sustain.
    let mut tc1 = TestContext::new(1, 1)
        .with_param("attack", attack as f32)
        .with_param("decay", decay as f32)
        .with_param("sustain", sustain as f32)
        .with_param("release", release as f32);
    tc1.fill_input(0, 1.0);
    tc1.process(&mut env).unwrap();
    let out1 = tc1.output(0).to_vec();

    // Phase 2: Gate off — release.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("attack", attack as f32)
        .with_param("decay", decay as f32)
        .with_param("sustain", sustain as f32)
        .with_param("release", release as f32);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut env).unwrap();
    let out2 = tc2.output(0).to_vec();

    // After gate on for 256 samples with very short attack+decay,
    // the envelope should have reached sustain level.
    let last_gate_on = out1[BUFFER_SIZE - 1];
    assert!(
        (last_gate_on - sustain as f32).abs() < 0.05,
        "Should be at sustain level, got {last_gate_on}"
    );

    // After gate off, the envelope should decay toward 0.
    let last_release = out2[BUFFER_SIZE - 1];
    assert!(
        last_release < 0.05,
        "Should be near zero after release, got {last_release}"
    );
}

#[test]
fn test_envelope_retrigger() {
    let mut env = AdsrEnvelope::new();
    let mut tc = TestContext::new(1, 1)
        .with_param("attack", 0.001)
        .with_param("decay", 0.002)
        .with_param("sustain", 0.5)
        .with_param("release", 0.002);

    // Gate on.
    tc.fill_input(0, 1.0);
    tc.process(&mut env).unwrap();

    // Gate off.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("attack", 0.001)
        .with_param("decay", 0.002)
        .with_param("sustain", 0.5)
        .with_param("release", 0.002);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut env).unwrap();

    // Gate on again (retrigger).
    let mut tc3 = TestContext::new(1, 1)
        .with_param("attack", 0.001)
        .with_param("decay", 0.002)
        .with_param("sustain", 0.5)
        .with_param("release", 0.002);
    tc3.fill_input(0, 1.0);
    tc3.process(&mut env).unwrap();

    // Should have risen again.
    let out = tc3.output(0);
    let max_val = out.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    assert!(max_val > 0.3, "Envelope should retrigger, max={max_val}");
}

// ─── LFO tests ──────────────────────────────────────────────────────────────

#[test]
fn test_lfo_sine_output() {
    let mut lfo = Lfo::new();
    let mut tc = TestContext::new(0, 1)
        .with_param("rate", 1.0) // 1Hz
        .with_param("depth", 1.0)
        .with_param("waveform", 0.0); // sine

    tc.process(&mut lfo).unwrap();

    let output = tc.output(0);
    // At 1Hz and 48kHz, we get 256/48000 of a cycle ≈ 0.53%.
    // Unipolar output: sine starts at 0 → (0*0.5+0.5)*depth = 0.5.
    assert!(
        (output[0] - 0.5).abs() < 0.05,
        "LFO sine should start near 0.5 (unipolar midpoint), got {}",
        output[0]
    );
}

#[test]
fn test_lfo_depth_scaling() {
    let mut lfo1 = Lfo::new();
    let mut lfo2 = Lfo::new();

    let mut tc1 = TestContext::new(0, 1)
        .with_param("rate", 100.0)
        .with_param("depth", 1.0)
        .with_param("waveform", 0.0);
    let mut tc2 = TestContext::new(0, 1)
        .with_param("rate", 100.0)
        .with_param("depth", 0.5)
        .with_param("waveform", 0.0);

    tc1.process(&mut lfo1).unwrap();
    tc2.process(&mut lfo2).unwrap();

    let max1 = tc1.output(0).iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let max2 = tc2.output(0).iter().copied().fold(f32::NEG_INFINITY, f32::max);

    // Depth=0.5 should produce roughly half the amplitude of depth=1.0.
    assert!(
        (max2 - max1 * 0.5).abs() < 0.1,
        "LFO depth scaling: max1={max1}, max2={max2}"
    );
}

#[test]
fn test_lfo_all_waveforms() {
    // Use a rate high enough that we get at least one full cycle in BUFFER_SIZE samples.
    // At 48kHz with 256 samples, rate=500Hz gives ~2.67 full cycles.
    for waveform in 0..4 {
        let mut lfo = Lfo::new();
        let mut tc = TestContext::new(0, 1)
            .with_param("rate", 500.0)
            .with_param("depth", 1.0)
            .with_param("waveform", waveform as f32);

        tc.process(&mut lfo).unwrap();

        let output = tc.output(0);
        // All waveforms should produce non-trivial output in unipolar [0, 1] range.
        let max = output.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let min = output.iter().copied().fold(f32::INFINITY, f32::min);
        assert!(
            max > 0.6,
            "LFO waveform {waveform} should reach upper range, max={max}"
        );
        assert!(
            min < 0.4,
            "LFO waveform {waveform} should reach lower range, min={min}"
        );

        // All values should be within [0, 1] (with tiny tolerance).
        for &s in output {
            assert!(
                (-0.01..=1.01).contains(&s),
                "LFO waveform {waveform}: sample {s} out of unipolar range"
            );
        }
    }
}

// ─── Mixer tests ────────────────────────────────────────────────────────────

#[test]
fn test_mixer_sums_inputs() {
    let mut mixer = MixerNode::new();
    let mut tc = TestContext::new(3, 1);

    tc.fill_input(0, 0.3);
    tc.fill_input(1, 0.4);
    tc.fill_input(2, 0.1);

    tc.process(&mut mixer).unwrap();

    for &s in tc.output(0) {
        assert!(
            (s - 0.8).abs() < 1e-5,
            "Mixer should sum: expected 0.8, got {s}"
        );
    }
}

#[test]
fn test_mixer_single_input() {
    let mut mixer = MixerNode::new();
    let mut tc = TestContext::new(1, 1);
    tc.fill_input(0, 0.5);

    tc.process(&mut mixer).unwrap();

    for &s in tc.output(0) {
        assert!(
            (s - 0.5).abs() < 1e-5,
            "Single input mixer: expected 0.5, got {s}"
        );
    }
}

#[test]
fn test_mixer_no_input_is_silent() {
    let mut mixer = MixerNode::new();
    let mut tc = TestContext::new(0, 1);

    let status = tc.process(&mut mixer).unwrap();
    assert_eq!(status, ProcessStatus::Silent);

    for &s in tc.output(0) {
        assert!(s.abs() < 1e-6, "Mixer with no input should be silent, got {s}");
    }
}

// ─── Output node tests ─────────────────────────────────────────────────────

#[test]
fn test_output_copies_input() {
    let mut output_node = OutputNode::new();
    let mut tc = TestContext::new(1, 1);

    for i in 0..BUFFER_SIZE {
        tc.input_buffers[0][i] = i as f32 * 0.01;
    }

    tc.process(&mut output_node).unwrap();

    for i in 0..BUFFER_SIZE {
        assert_eq!(
            tc.output(0)[i],
            tc.input_buffers[0][i],
            "Output should copy input at sample {i}"
        );
    }
}

#[test]
fn test_output_silent_without_input() {
    let mut output_node = OutputNode::new();
    let mut tc = TestContext::new(0, 1);

    let status = tc.process(&mut output_node).unwrap();
    assert_eq!(status, ProcessStatus::Silent);

    for &s in tc.output(0) {
        assert!(s.abs() < 1e-6, "Output without input should be silent");
    }
}

// ─── MIDI-to-Freq tests ────────────────────────────────────────────────────

#[test]
fn test_midi_to_freq_a4() {
    let mut m2f = MidiToFreq::new();
    let midi_msgs = vec![MidiMessage {
        sample_offset: 0,
        status: 0x90, // Note On, channel 0
        data1: 69,    // A4
        data2: 100,   // velocity
    }];

    let mut tc = TestContext::new(0, 2).with_midi(midi_msgs);
    tc.process(&mut m2f).unwrap();

    // Output 0 should be 440Hz.
    let freq = tc.output(0)[0];
    assert!(
        (freq - 440.0).abs() < 0.01,
        "A4 (MIDI 69) should be 440Hz, got {freq}"
    );

    // Output 1 should be gate = 1.0.
    let gate = tc.output(1)[0];
    assert!(
        (gate - 1.0).abs() < 0.01,
        "Gate should be 1.0 after note on, got {gate}"
    );
}

#[test]
fn test_midi_to_freq_middle_c() {
    let mut m2f = MidiToFreq::new();
    let midi_msgs = vec![MidiMessage {
        sample_offset: 0,
        status: 0x90,
        data1: 60, // Middle C
        data2: 100,
    }];

    let mut tc = TestContext::new(0, 2).with_midi(midi_msgs);
    tc.process(&mut m2f).unwrap();

    let freq = tc.output(0)[0];
    let expected = 261.626; // Middle C frequency
    assert!(
        (freq - expected).abs() < 0.01,
        "Middle C should be ~{expected}Hz, got {freq}"
    );
}

#[test]
fn test_midi_to_freq_note_off() {
    let mut m2f = MidiToFreq::new();

    // Note on.
    let mut tc1 = TestContext::new(0, 2).with_midi(vec![MidiMessage {
        sample_offset: 0,
        status: 0x90,
        data1: 69,
        data2: 100,
    }]);
    tc1.process(&mut m2f).unwrap();
    assert!((tc1.output(1)[0] - 1.0).abs() < 0.01, "Gate should be on");

    // Note off.
    let mut tc2 = TestContext::new(0, 2).with_midi(vec![MidiMessage {
        sample_offset: 0,
        status: 0x80, // Note Off
        data1: 69,
        data2: 0,
    }]);
    tc2.process(&mut m2f).unwrap();
    assert!(
        tc2.output(1)[0].abs() < 0.01,
        "Gate should be off after note off, got {}",
        tc2.output(1)[0]
    );
}

#[test]
fn test_midi_to_freq_velocity_zero_is_note_off() {
    let mut m2f = MidiToFreq::new();

    // Note on.
    let mut tc1 = TestContext::new(0, 2).with_midi(vec![MidiMessage {
        sample_offset: 0,
        status: 0x90,
        data1: 69,
        data2: 100,
    }]);
    tc1.process(&mut m2f).unwrap();

    // Note on with velocity 0 (= note off).
    let mut tc2 = TestContext::new(0, 2).with_midi(vec![MidiMessage {
        sample_offset: 0,
        status: 0x90,
        data1: 69,
        data2: 0, // velocity 0 = note off
    }]);
    tc2.process(&mut m2f).unwrap();
    assert!(
        tc2.output(1)[0].abs() < 0.01,
        "Velocity 0 note-on should act as note-off"
    );
}

#[test]
fn test_midi_note_to_freq_table() {
    use crate::midi::midi_to_freq::midi_note_to_freq;

    // A4 = 440 Hz
    assert!((midi_note_to_freq(69) - 440.0).abs() < 0.01);
    // A3 = 220 Hz (one octave down)
    assert!((midi_note_to_freq(57) - 220.0).abs() < 0.01);
    // A5 = 880 Hz (one octave up)
    assert!((midi_note_to_freq(81) - 880.0).abs() < 0.01);
    // C4 (Middle C) ≈ 261.626 Hz
    assert!((midi_note_to_freq(60) - 261.626).abs() < 0.01);
}

// ─── Registry tests ─────────────────────────────────────────────────────────

#[test]
fn test_registry_creates_all_wave1_nodes() {
    let registry = NodeRegistry::with_wave1();

    let expected_types = [
        "oscillator",
        "filter",
        "gain",
        "envelope",
        "lfo",
        "mixer",
        "output",
        "midi_to_freq",
        "note_to_freq",
        "expression",
    ];

    for type_name in &expected_types {
        assert!(
            registry.has_type(type_name),
            "Registry should have '{type_name}'"
        );
        let node = registry.create(type_name);
        assert!(
            node.is_some(),
            "Registry should create a node for '{type_name}'"
        );
    }

    assert_eq!(registry.len(), expected_types.len());
}

#[test]
fn test_registry_unknown_type() {
    let registry = NodeRegistry::with_wave1();
    assert!(registry.create("nonexistent").is_none());
    assert!(!registry.has_type("nonexistent"));
}

#[test]
fn test_registry_custom_registration() {
    let mut registry = NodeRegistry::new();
    assert!(registry.is_empty());

    registry.register("custom", || Box::new(GainNode::new()));
    assert_eq!(registry.len(), 1);
    assert!(registry.has_type("custom"));
    assert!(registry.create("custom").is_some());
}

#[test]
fn test_registry_listed_types() {
    let registry = NodeRegistry::with_wave1();
    let types = registry.registered_types();
    assert_eq!(types.len(), 10);
    assert!(types.contains(&"oscillator"));
    assert!(types.contains(&"filter"));
}

// ─── Round-trip integration tests ───────────────────────────────────────────

#[test]
fn test_roundtrip_oscillator_gain_output() {
    let registry = NodeRegistry::with_wave1();

    // Create nodes from registry.
    let mut osc = registry.create("oscillator").unwrap();
    let mut gain = registry.create("gain").unwrap();
    let mut output = registry.create("output").unwrap();

    // Step 1: Generate a 440Hz sine.
    let mut tc_osc = TestContext::new(0, 1).with_param("frequency", 440.0).with_param("waveform", 0.0);
    tc_osc.process(osc.as_mut()).unwrap();

    // Step 2: Apply 0.5 gain.
    // First, initialize the gain to 0.5 so it settles.
    let mut tc_gain_init = TestContext::new(1, 1).with_param("gain", 0.5);
    tc_gain_init.fill_input(0, 0.0);
    tc_gain_init.process(gain.as_mut()).unwrap();

    let mut tc_gain = TestContext::new(1, 1).with_param("gain", 0.5);
    tc_gain.set_input(0, tc_osc.output(0));
    tc_gain.process(gain.as_mut()).unwrap();

    // Step 3: Pass through output node.
    let mut tc_out = TestContext::new(1, 1);
    tc_out.set_input(0, tc_gain.output(0));
    tc_out.process(output.as_mut()).unwrap();

    let final_output = tc_out.output(0);

    // Verify: output is non-silent.
    let rms_val = rms(final_output);
    assert!(rms_val > 0.01, "Round-trip output should not be silent, rms={rms_val}");

    // Verify: output is roughly half the amplitude of the original oscillator.
    let rms_osc = rms(tc_osc.output(0));
    // Allow some tolerance for smoothing transient.
    assert!(
        (rms_val / rms_osc - 0.5).abs() < 0.15,
        "Gain should roughly halve amplitude: rms_out={rms_val}, rms_osc={rms_osc}, ratio={}",
        rms_val / rms_osc
    );
}

#[test]
fn test_roundtrip_midi_to_osc() {
    let registry = NodeRegistry::with_wave1();

    let mut m2f = registry.create("midi_to_freq").unwrap();
    let mut osc = registry.create("oscillator").unwrap();

    // Send MIDI note A4.
    let mut tc_m2f = TestContext::new(0, 2).with_midi(vec![MidiMessage {
        sample_offset: 0,
        status: 0x90,
        data1: 69,
        data2: 100,
    }]);
    tc_m2f.process(m2f.as_mut()).unwrap();

    // Feed frequency output into oscillator.
    let mut tc_osc = TestContext::new(1, 1)
        .with_param("frequency", 0.0) // Base freq overridden by FM input.
        .with_param("waveform", 0.0);
    tc_osc.set_input(0, tc_m2f.output(0));
    tc_osc.process(osc.as_mut()).unwrap();

    let output = tc_osc.output(0);
    let rms_val = rms(output);
    assert!(
        rms_val > 0.1,
        "MIDI→Oscillator should produce audible output, rms={rms_val}"
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Count zero crossings (sign changes) in a buffer.
fn count_zero_crossings(buf: &[f32]) -> usize {
    let mut count = 0;
    for i in 1..buf.len() {
        if (buf[i] > 0.0 && buf[i - 1] <= 0.0) || (buf[i] <= 0.0 && buf[i - 1] > 0.0) {
            count += 1;
        }
    }
    count
}

/// Calculate RMS (root mean square) of a buffer.
fn rms(buf: &[f32]) -> f32 {
    if buf.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = buf.iter().map(|&s| s * s).sum();
    (sum_sq / buf.len() as f32).sqrt()
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 2 — Effects Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── Delay tests ────────────────────────────────────────────────────────────

#[test]
fn test_delay_produces_delayed_output() {
    let mut delay = DelayNode::new();
    let delay_time_sec = 0.01; // 10ms = 480 samples at 48kHz
    let delay_samples = (delay_time_sec * SAMPLE_RATE) as usize;

    // Create an impulse (single sample at the start).
    let mut tc = TestContext::new(1, 1)
        .with_param("time", delay_time_sec as f32)
        .with_param("feedback", 0.0)
        .with_param("mix", 1.0); // fully wet
    tc.input_buffers[0][0] = 1.0;

    tc.process(&mut delay).unwrap();

    // The impulse should appear at the delay offset.
    // Check that output before delay is near zero.
    for i in 0..delay_samples.min(BUFFER_SIZE).saturating_sub(1) {
        assert!(
            tc.output(0)[i].abs() < 0.01,
            "Before delay: output[{i}]={} should be near 0",
            tc.output(0)[i]
        );
    }

    // Check that the impulse appears at the delay time.
    if delay_samples < BUFFER_SIZE {
        assert!(
            tc.output(0)[delay_samples].abs() > 0.5,
            "Delayed impulse should appear at sample {delay_samples}, got {}",
            tc.output(0)[delay_samples]
        );
    }
}

#[test]
fn test_delay_dry_wet_mix() {
    let mut delay = DelayNode::new();

    // At mix=0 (fully dry), output should equal input immediately.
    let mut tc = TestContext::new(1, 1)
        .with_param("time", 0.01)
        .with_param("feedback", 0.0)
        .with_param("mix", 0.0); // fully dry
    tc.fill_input(0, 0.5);

    tc.process(&mut delay).unwrap();

    // Dry signal should pass through immediately.
    assert!(
        (tc.output(0)[0] - 0.5).abs() < 0.01,
        "Dry mix: output should equal input, got {}",
        tc.output(0)[0]
    );
}

#[test]
fn test_delay_feedback() {
    let mut delay = DelayNode::new();
    let delay_time_sec = 0.005_f32; // 5ms
    // Compute delay_samples the same way the node does (f32 -> f64 -> usize).
    let delay_samples = (delay_time_sec as f64 * SAMPLE_RATE) as usize;

    // Impulse with feedback.
    let mut tc = TestContext::new(1, 1)
        .with_param("time", delay_time_sec)
        .with_param("feedback", 0.5)
        .with_param("mix", 1.0);
    tc.input_buffers[0][0] = 1.0;

    tc.process(&mut delay).unwrap();

    // First echo at delay_samples.
    if delay_samples < BUFFER_SIZE {
        let first_echo = tc.output(0)[delay_samples].abs();
        assert!(
            first_echo > 0.3,
            "First echo should be significant at sample {delay_samples}, got {first_echo}"
        );
    }

    // For second echo, process another buffer (all silence input).
    // Second echo appears at delay_samples * 2, which may span two buffers.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("time", delay_time_sec)
        .with_param("feedback", 0.5)
        .with_param("mix", 1.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut delay).unwrap();

    // The second echo should be at sample (delay_samples * 2 - BUFFER_SIZE) in the second buffer.
    let second_echo_pos = delay_samples * 2;
    if (BUFFER_SIZE..BUFFER_SIZE * 2).contains(&second_echo_pos) {
        let idx = second_echo_pos - BUFFER_SIZE;
        let second_echo = tc2.output(0)[idx].abs();
        // It should be quieter due to feedback (0.5 attenuation).
        assert!(
            second_echo > 0.05,
            "Second echo should exist due to feedback, got {second_echo}"
        );
        // Should be smaller than first echo.
        if delay_samples < BUFFER_SIZE {
            let first_echo = tc.output(0)[delay_samples].abs();
            assert!(
                second_echo < first_echo,
                "Second echo ({second_echo}) should be quieter than first ({first_echo})"
            );
        }
    }
}

#[test]
fn test_delay_reset() {
    let mut delay = DelayNode::new();

    // Feed some signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("time", 0.01)
        .with_param("feedback", 0.5)
        .with_param("mix", 1.0);
    tc.fill_input(0, 1.0);
    tc.process(&mut delay).unwrap();

    // Reset.
    delay.reset();

    // Process silence — should output silence.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("time", 0.01)
        .with_param("feedback", 0.5)
        .with_param("mix", 1.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut delay).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-6, "After reset, silence in should produce silence out, max={max}");
}

// ─── Reverb tests ──────────────────────────────────────────────────────────

#[test]
fn test_reverb_adds_reverberation() {
    let mut reverb = ReverbNode::new();

    // Feed an impulse. The Schroeder comb filters have delays of 1422-1617 samples,
    // so we need to process several 256-sample buffers before any output appears.
    let mut tc = TestContext::new(1, 1)
        .with_param("room_size", 0.8)
        .with_param("damping", 0.5)
        .with_param("mix", 1.0); // fully wet
    tc.input_buffers[0][0] = 1.0;
    tc.process(&mut reverb).unwrap();

    // Process several more silence buffers until the comb delays are reached.
    // Need at least ceil(1617 / 256) = 7 buffers total.
    let mut max_rms = 0.0_f32;
    for _ in 0..10 {
        let mut tc_silence = TestContext::new(1, 1)
            .with_param("room_size", 0.8)
            .with_param("damping", 0.5)
            .with_param("mix", 1.0);
        tc_silence.fill_input(0, 0.0);
        tc_silence.process(&mut reverb).unwrap();
        let r = rms(tc_silence.output(0));
        if r > max_rms {
            max_rms = r;
        }
    }

    assert!(
        max_rms > 0.001,
        "Reverb should produce output after impulse, max_rms={max_rms}"
    );

    // Process more silence buffers — the tail should still be producing output.
    let mut tc_tail = TestContext::new(1, 1)
        .with_param("room_size", 0.8)
        .with_param("damping", 0.5)
        .with_param("mix", 1.0);
    tc_tail.fill_input(0, 0.0);
    tc_tail.process(&mut reverb).unwrap();
    let tail_energy = rms(tc_tail.output(0));

    assert!(
        tail_energy > 0.0001,
        "Reverb tail should continue after input stops, rms={tail_energy}"
    );
}

#[test]
fn test_reverb_output_not_dry() {
    let mut reverb = ReverbNode::new();

    // Feed a constant signal through reverb with full wet.
    let mut tc = TestContext::new(1, 1)
        .with_param("room_size", 0.5)
        .with_param("damping", 0.5)
        .with_param("mix", 1.0); // fully wet
    tc.fill_input(0, 0.5);
    tc.process(&mut reverb).unwrap();

    // The wet output should differ from the dry input.
    let output_matches_input = tc.output(0).iter().all(|&s| (s - 0.5).abs() < 0.01);
    assert!(
        !output_matches_input,
        "Reverb wet output should differ from dry input"
    );
}

#[test]
fn test_reverb_mix_zero_is_dry() {
    let mut reverb = ReverbNode::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("room_size", 0.5)
        .with_param("damping", 0.5)
        .with_param("mix", 0.0); // fully dry
    tc.fill_input(0, 0.75);
    tc.process(&mut reverb).unwrap();

    // With mix=0, output should equal input.
    for &s in tc.output(0) {
        assert!(
            (s - 0.75).abs() < 0.01,
            "Mix=0 should pass dry signal, got {s}"
        );
    }
}

#[test]
fn test_reverb_reset() {
    let mut reverb = ReverbNode::new();

    // Feed signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("room_size", 0.9)
        .with_param("damping", 0.3)
        .with_param("mix", 1.0);
    tc.fill_input(0, 1.0);
    tc.process(&mut reverb).unwrap();

    // Reset.
    reverb.reset();

    // Process silence — tail should be gone.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("room_size", 0.9)
        .with_param("damping", 0.3)
        .with_param("mix", 1.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut reverb).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-6, "Reverb after reset+silence should be silent, max={max}");
}

// ─── Compressor tests ──────────────────────────────────────────────────────

#[test]
fn test_compressor_reduces_dynamic_range() {
    let mut comp = CompressorNode::new();

    // Generate a loud signal (above threshold).
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -6.0)
        .with_param("ratio", 4.0)
        .with_param("attack", 0.1) // very fast attack
        .with_param("release", 100.0)
        .with_param("makeup", 0.0);
    // Fill with a 0.9 amplitude signal (about -0.9 dB, well above -6 dB threshold).
    tc.fill_input(0, 0.9);

    // Process multiple buffers to let the envelope settle.
    for _ in 0..4 {
        tc.process(&mut comp).unwrap();
    }

    let output = tc.output(0);

    // The output should be quieter than the input due to compression.
    let rms_out = rms(output);
    let rms_in = 0.9; // constant input amplitude
    assert!(
        rms_out < rms_in,
        "Compressor should reduce level above threshold: out_rms={rms_out}, in={rms_in}"
    );
}

#[test]
fn test_compressor_passes_below_threshold() {
    let mut comp = CompressorNode::new();

    // Signal well below threshold — should pass through with minimal change.
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -6.0)
        .with_param("ratio", 4.0)
        .with_param("attack", 0.1)
        .with_param("release", 100.0)
        .with_param("makeup", 0.0);
    // 0.1 amplitude ≈ -20 dB, well below -6 dB threshold.
    tc.fill_input(0, 0.1);

    // Process enough for envelope to settle.
    for _ in 0..4 {
        tc.process(&mut comp).unwrap();
    }

    let output = tc.output(0);
    // Output should be very close to input since signal is below threshold.
    for &s in &output[BUFFER_SIZE / 2..] {
        assert!(
            (s - 0.1).abs() < 0.05,
            "Below threshold, signal should pass ~unchanged, got {s}"
        );
    }
}

#[test]
fn test_compressor_makeup_gain() {
    let mut comp = CompressorNode::new();

    // Apply makeup gain to a quiet signal below threshold.
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -6.0)
        .with_param("ratio", 1.0) // no compression
        .with_param("attack", 0.1)
        .with_param("release", 100.0)
        .with_param("makeup", 12.0); // +12 dB makeup
    tc.fill_input(0, 0.1);

    for _ in 0..4 {
        tc.process(&mut comp).unwrap();
    }

    let rms_out = rms(tc.output(0));
    // With +12 dB makeup (≈ 4x linear), output should be louder.
    assert!(
        rms_out > 0.1,
        "Makeup gain should boost signal, got rms={rms_out}"
    );
}

#[test]
fn test_compressor_reset() {
    let mut comp = CompressorNode::new();

    // Process loud signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -20.0)
        .with_param("ratio", 10.0)
        .with_param("attack", 0.1)
        .with_param("release", 1000.0)
        .with_param("makeup", 0.0);
    tc.fill_input(0, 1.0);
    tc.process(&mut comp).unwrap();

    comp.reset();

    // After reset, the envelope should start fresh.
    // With a quiet signal, the output should pass through without the old envelope state.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("threshold", -6.0)
        .with_param("ratio", 4.0)
        .with_param("attack", 0.1)
        .with_param("release", 100.0)
        .with_param("makeup", 0.0);
    tc2.fill_input(0, 0.1);
    for _ in 0..4 {
        tc2.process(&mut comp).unwrap();
    }

    // Should be near 0.1 (pass-through for below-threshold).
    let last_sample = tc2.output(0)[BUFFER_SIZE - 1];
    assert!(
        (last_sample - 0.1).abs() < 0.05,
        "After reset, below-threshold signal should pass through, got {last_sample}"
    );
}

// ─── EQ tests ──────────────────────────────────────────────────────────────

#[test]
fn test_eq_boost_low_band() {
    let mut eq = EqNode::new();

    // Generate a 100Hz sine (low frequency).
    let mut osc = Oscillator::new();

    // Apply +12dB low band boost at 100Hz.
    // Process multiple buffers with fresh oscillator input to let the EQ settle.
    for _ in 0..16 {
        let mut tc_osc = TestContext::new(0, 1)
            .with_param("frequency", 100.0)
            .with_param("waveform", 0.0);
        tc_osc.process(&mut osc).unwrap();

        let mut tc = TestContext::new(1, 1)
            .with_param("low_freq", 100.0)
            .with_param("low_gain", 12.0)
            .with_param("low_q", 1.0)
            .with_param("mid_gain", 0.0)
            .with_param("high_gain", 0.0);
        tc.set_input(0, tc_osc.output(0));
        tc.process(&mut eq).unwrap();
    }

    // Now measure with fresh oscillator input through the settled EQ.
    let mut osc_ref = Oscillator::new();
    // Process the reference oscillator to the same phase as the main one.
    for _ in 0..16 {
        let mut tc_skip = TestContext::new(0, 1)
            .with_param("frequency", 100.0)
            .with_param("waveform", 0.0);
        tc_skip.process(&mut osc_ref).unwrap();
    }
    let mut tc_ref = TestContext::new(0, 1)
        .with_param("frequency", 100.0)
        .with_param("waveform", 0.0);
    tc_ref.process(&mut osc_ref).unwrap();
    let rms_dry = rms(tc_ref.output(0));

    let mut tc_osc2 = TestContext::new(0, 1)
        .with_param("frequency", 100.0)
        .with_param("waveform", 0.0);
    tc_osc2.process(&mut osc).unwrap();
    let mut tc_eq = TestContext::new(1, 1)
        .with_param("low_freq", 100.0)
        .with_param("low_gain", 12.0)
        .with_param("low_q", 1.0)
        .with_param("mid_gain", 0.0)
        .with_param("high_gain", 0.0);
    tc_eq.set_input(0, tc_osc2.output(0));
    tc_eq.process(&mut eq).unwrap();
    let rms_wet = rms(tc_eq.output(0));

    // +12dB boost should increase level by about 4x. Allow generous margin for settling.
    assert!(
        rms_wet > rms_dry * 1.2,
        "EQ boost at 100Hz should increase 100Hz signal: wet_rms={rms_wet}, dry_rms={rms_dry}"
    );
}

#[test]
fn test_eq_cut_high_band() {
    let mut eq = EqNode::new();

    // Generate a 5kHz sine (high frequency).
    let mut osc = Oscillator::new();
    let mut tc_osc = TestContext::new(0, 1)
        .with_param("frequency", 5000.0)
        .with_param("waveform", 0.0);
    tc_osc.process(&mut osc).unwrap();
    let rms_dry = rms(tc_osc.output(0));

    // Apply -12dB high band cut at 5kHz.
    let mut tc = TestContext::new(1, 1)
        .with_param("low_gain", 0.0)
        .with_param("mid_gain", 0.0)
        .with_param("high_freq", 5000.0)
        .with_param("high_gain", -12.0)
        .with_param("high_q", 1.0);
    tc.set_input(0, tc_osc.output(0));

    for _ in 0..8 {
        tc.process(&mut eq).unwrap();
    }

    let rms_wet = rms(tc.output(0));
    assert!(
        rms_wet < rms_dry * 0.7,
        "EQ cut at 5kHz should reduce 5kHz signal: wet_rms={rms_wet}, dry_rms={rms_dry}"
    );
}

#[test]
fn test_eq_flat_is_passthrough() {
    let mut eq = EqNode::new();

    // Generate a signal.
    let mut osc = Oscillator::new();
    let mut tc_osc = TestContext::new(0, 1)
        .with_param("frequency", 440.0)
        .with_param("waveform", 0.0);
    tc_osc.process(&mut osc).unwrap();

    // All bands at 0 dB gain — should pass through unchanged.
    let mut tc = TestContext::new(1, 1)
        .with_param("low_gain", 0.0)
        .with_param("mid_gain", 0.0)
        .with_param("high_gain", 0.0);
    tc.set_input(0, tc_osc.output(0));

    // Let the EQ settle.
    for _ in 0..4 {
        tc.process(&mut eq).unwrap();
    }

    // Output should be very close to input.
    let rms_in = rms(tc_osc.output(0));
    let rms_out = rms(tc.output(0));
    let ratio = rms_out / rms_in;
    assert!(
        (ratio - 1.0).abs() < 0.05,
        "Flat EQ should be ~unity gain, ratio={ratio}"
    );
}

#[test]
fn test_eq_reset() {
    let mut eq = EqNode::new();

    // Feed a signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("low_gain", 12.0)
        .with_param("mid_gain", 12.0)
        .with_param("high_gain", 12.0);
    tc.fill_input(0, 1.0);
    tc.process(&mut eq).unwrap();

    eq.reset();

    // After reset, processing silence should produce silence.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("low_gain", 0.0)
        .with_param("mid_gain", 0.0)
        .with_param("high_gain", 0.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut eq).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-5, "EQ after reset+silence should output silence, max={max}");
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 3 — Generative/Experimental Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── Euclidean rhythm tests ────────────────────────────────────────────────

#[test]
fn test_euclidean_e3_8() {
    let mut eucl = EuclideanNode::new();

    // E(3,8) should produce pattern [1,0,0,1,0,0,1,0]
    // We provide a clock with 8 rising edges to step through the pattern.
    let steps = 8;
    let mut pattern = Vec::new();

    for _step in 0..steps {
        // Rising edge: clock goes from 0 to 1.
        let mut tc_high = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 3.0)
            .with_param("rotation", 0.0);
        tc_high.fill_input(0, 1.0);
        tc_high.process(&mut eucl).unwrap();
        let trigger = tc_high.output(0)[BUFFER_SIZE - 1];
        pattern.push(trigger > 0.5);

        // Clock goes low.
        let mut tc_low = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 3.0)
            .with_param("rotation", 0.0);
        tc_low.fill_input(0, 0.0);
        tc_low.process(&mut eucl).unwrap();
    }

    // E(3,8) = [x..x..x.] -> [true, false, false, true, false, false, true, false]
    let expected = [true, false, false, true, false, false, true, false];
    assert_eq!(
        pattern, expected,
        "E(3,8) should be [1,0,0,1,0,0,1,0], got {pattern:?}"
    );
}

#[test]
fn test_euclidean_e4_8() {
    let mut eucl = EuclideanNode::new();
    let steps = 8;
    let mut pattern = Vec::new();

    for _step in 0..steps {
        let mut tc_high = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 4.0)
            .with_param("rotation", 0.0);
        tc_high.fill_input(0, 1.0);
        tc_high.process(&mut eucl).unwrap();
        pattern.push(tc_high.output(0)[BUFFER_SIZE - 1] > 0.5);

        let mut tc_low = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 4.0)
            .with_param("rotation", 0.0);
        tc_low.fill_input(0, 0.0);
        tc_low.process(&mut eucl).unwrap();
    }

    // E(4,8) should have exactly 4 pulses distributed evenly: [1,0,1,0,1,0,1,0]
    let pulse_count: usize = pattern.iter().filter(|&&p| p).count();
    assert_eq!(
        pulse_count, 4,
        "E(4,8) should have exactly 4 pulses, got {pulse_count}"
    );
}

#[test]
fn test_euclidean_e5_8() {
    let mut eucl = EuclideanNode::new();
    let steps = 8;
    let mut pattern = Vec::new();

    for _step in 0..steps {
        let mut tc_high = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 5.0)
            .with_param("rotation", 0.0);
        tc_high.fill_input(0, 1.0);
        tc_high.process(&mut eucl).unwrap();
        pattern.push(tc_high.output(0)[BUFFER_SIZE - 1] > 0.5);

        let mut tc_low = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 5.0)
            .with_param("rotation", 0.0);
        tc_low.fill_input(0, 0.0);
        tc_low.process(&mut eucl).unwrap();
    }

    let pulse_count: usize = pattern.iter().filter(|&&p| p).count();
    assert_eq!(
        pulse_count, 5,
        "E(5,8) should have exactly 5 pulses, got {pulse_count}"
    );
}

#[test]
fn test_euclidean_rotation() {
    // E(3,8) with rotation=1 should shift the pattern by one step.
    let mut eucl = EuclideanNode::new();
    let steps = 8;
    let mut pattern = Vec::new();

    for _step in 0..steps {
        let mut tc_high = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 3.0)
            .with_param("rotation", 1.0);
        tc_high.fill_input(0, 1.0);
        tc_high.process(&mut eucl).unwrap();
        pattern.push(tc_high.output(0)[BUFFER_SIZE - 1] > 0.5);

        let mut tc_low = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 3.0)
            .with_param("rotation", 1.0);
        tc_low.fill_input(0, 0.0);
        tc_low.process(&mut eucl).unwrap();
    }

    let pulse_count: usize = pattern.iter().filter(|&&p| p).count();
    assert_eq!(pulse_count, 3, "Rotated E(3,8) should still have 3 pulses");
    // The pattern should differ from unrotated E(3,8).
    let unrotated = [true, false, false, true, false, false, true, false];
    assert_ne!(
        pattern, unrotated,
        "Rotated pattern should differ from unrotated"
    );
}

#[test]
fn test_euclidean_reset() {
    let mut eucl = EuclideanNode::new();

    // Step through some of the pattern.
    for _ in 0..3 {
        let mut tc_high = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 3.0)
            .with_param("rotation", 0.0);
        tc_high.fill_input(0, 1.0);
        tc_high.process(&mut eucl).unwrap();

        let mut tc_low = TestContext::new(1, 1)
            .with_param("steps", 8.0)
            .with_param("pulses", 3.0)
            .with_param("rotation", 0.0);
        tc_low.fill_input(0, 0.0);
        tc_low.process(&mut eucl).unwrap();
    }

    eucl.reset();

    // After reset, should start from beginning of pattern again.
    // First step of E(3,8) is a pulse.
    let mut tc_high = TestContext::new(1, 1)
        .with_param("steps", 8.0)
        .with_param("pulses", 3.0)
        .with_param("rotation", 0.0);
    tc_high.fill_input(0, 1.0);
    tc_high.process(&mut eucl).unwrap();

    assert!(
        tc_high.output(0)[BUFFER_SIZE - 1] > 0.5,
        "After reset, first step should be a pulse"
    );
}

// ─── Noise tests ───────────────────────────────────────────────────────────

#[test]
fn test_noise_white_produces_output() {
    let mut noise = NoiseNode::new();
    let mut tc = TestContext::new(0, 1)
        .with_param("color", 0.0) // white
        .with_param("amplitude", 1.0);

    tc.process(&mut noise).unwrap();
    let output = tc.output(0);

    // White noise should have significant energy.
    let rms_val = rms(output);
    assert!(rms_val > 0.1, "White noise should have energy, rms={rms_val}");

    // Should contain both positive and negative values.
    let has_positive = output.iter().any(|&s| s > 0.1);
    let has_negative = output.iter().any(|&s| s < -0.1);
    assert!(has_positive, "White noise should have positive values");
    assert!(has_negative, "White noise should have negative values");
}

#[test]
fn test_noise_pink_produces_output() {
    let mut noise = NoiseNode::new();
    let mut tc = TestContext::new(0, 1)
        .with_param("color", 1.0) // pink
        .with_param("amplitude", 1.0);

    tc.process(&mut noise).unwrap();
    let rms_val = rms(tc.output(0));
    assert!(rms_val > 0.05, "Pink noise should have energy, rms={rms_val}");
}

#[test]
fn test_noise_brown_produces_output() {
    let mut noise = NoiseNode::new();
    let mut tc = TestContext::new(0, 1)
        .with_param("color", 2.0) // brown
        .with_param("amplitude", 1.0);

    // Brown noise builds up over time, process a few buffers.
    for _ in 0..4 {
        tc.process(&mut noise).unwrap();
    }
    let rms_val = rms(tc.output(0));
    assert!(rms_val > 0.01, "Brown noise should have energy, rms={rms_val}");
}

#[test]
fn test_noise_amplitude_scaling() {
    let mut noise1 = NoiseNode::new();
    let mut noise2 = NoiseNode::new();

    let mut tc1 = TestContext::new(0, 1)
        .with_param("color", 0.0)
        .with_param("amplitude", 1.0);
    let mut tc2 = TestContext::new(0, 1)
        .with_param("color", 0.0)
        .with_param("amplitude", 0.5);

    tc1.process(&mut noise1).unwrap();
    tc2.process(&mut noise2).unwrap();

    let rms1 = rms(tc1.output(0));
    let rms2 = rms(tc2.output(0));

    // Both use the same RNG seed, so amplitude=0.5 should be ~half the RMS.
    assert!(
        (rms2 / rms1 - 0.5).abs() < 0.15,
        "Half amplitude should give ~half RMS: rms1={rms1}, rms2={rms2}, ratio={}",
        rms2 / rms1
    );
}

#[test]
fn test_noise_reset_deterministic() {
    let mut noise = NoiseNode::new();

    let mut tc1 = TestContext::new(0, 1)
        .with_param("color", 0.0)
        .with_param("amplitude", 1.0);
    tc1.process(&mut noise).unwrap();
    let out1 = tc1.output(0).to_vec();

    noise.reset();

    let mut tc2 = TestContext::new(0, 1)
        .with_param("color", 0.0)
        .with_param("amplitude", 1.0);
    tc2.process(&mut noise).unwrap();
    let out2 = tc2.output(0);

    // After reset, should produce the same sequence.
    assert_eq!(out1, out2, "Noise should be deterministic after reset");
}

// ─── Sample-and-Hold tests ────────────────────────────────────────────────

#[test]
fn test_sample_and_hold_holds_value() {
    let mut sh = SampleAndHoldNode::new();

    // Provide a signal (ramp) and a single trigger at sample 0.
    let mut tc = TestContext::new(2, 1);
    // Signal input: ramp from 0 to 1.
    for i in 0..BUFFER_SIZE {
        tc.input_buffers[0][i] = i as f32 / BUFFER_SIZE as f32;
    }
    // Trigger: high at sample 0, low elsewhere.
    tc.input_buffers[1][0] = 1.0;
    for s in tc.input_buffers[1][1..].iter_mut() {
        *s = 0.0;
    }

    tc.process(&mut sh).unwrap();
    let output = tc.output(0);

    // The held value should be the signal value at sample 0 (≈ 0.0).
    let held = output[0];
    // All subsequent samples should hold the same value.
    for (i, &sample) in output.iter().enumerate().skip(1) {
        assert!(
            (sample - held).abs() < 1e-6,
            "S&H should hold value: output[{i}]={sample}, expected {held}",
        );
    }
}

#[test]
fn test_sample_and_hold_updates_on_trigger() {
    let mut sh = SampleAndHoldNode::new();

    // First trigger: sample value 0.3.
    let mut tc1 = TestContext::new(2, 1);
    tc1.fill_input(0, 0.3);
    tc1.input_buffers[1][0] = 1.0;
    for s in tc1.input_buffers[1][1..].iter_mut() {
        *s = 0.0;
    }
    tc1.process(&mut sh).unwrap();
    assert!(
        (tc1.output(0)[BUFFER_SIZE - 1] - 0.3).abs() < 0.01,
        "Should hold 0.3"
    );

    // Low trigger — should still hold 0.3.
    let mut tc_low = TestContext::new(2, 1);
    tc_low.fill_input(0, 0.9);
    tc_low.fill_input(1, 0.0);
    tc_low.process(&mut sh).unwrap();
    assert!(
        (tc_low.output(0)[BUFFER_SIZE - 1] - 0.3).abs() < 0.01,
        "Should still hold 0.3 without trigger"
    );

    // Second trigger: sample value 0.7.
    let mut tc2 = TestContext::new(2, 1);
    tc2.fill_input(0, 0.7);
    tc2.input_buffers[1][0] = 1.0;
    for s in tc2.input_buffers[1][1..].iter_mut() {
        *s = 0.0;
    }
    tc2.process(&mut sh).unwrap();
    assert!(
        (tc2.output(0)[BUFFER_SIZE - 1] - 0.7).abs() < 0.01,
        "Should now hold 0.7"
    );
}

#[test]
fn test_sample_and_hold_edge_detection() {
    let mut sh = SampleAndHoldNode::new();

    // Trigger stays high — should only sample once (on the rising edge).
    let mut tc = TestContext::new(2, 1);
    // Signal ramps up.
    for i in 0..BUFFER_SIZE {
        tc.input_buffers[0][i] = i as f32 / BUFFER_SIZE as f32;
    }
    // Trigger is high for the entire buffer.
    tc.fill_input(1, 1.0);

    tc.process(&mut sh).unwrap();
    let output = tc.output(0);

    // Should have sampled on the first rising edge (sample 0) and held.
    let held = output[0];
    for (i, &sample) in output.iter().enumerate().skip(1) {
        assert!(
            (sample - held).abs() < 1e-6,
            "S&H should only trigger on rising edge, output[{i}]={sample}, expected {held}",
        );
    }
}

#[test]
fn test_sample_and_hold_reset() {
    let mut sh = SampleAndHoldNode::new();

    // Trigger with value 0.5.
    let mut tc = TestContext::new(2, 1);
    tc.fill_input(0, 0.5);
    tc.input_buffers[1][0] = 1.0;
    tc.process(&mut sh).unwrap();

    sh.reset();

    // After reset, held value should be 0.
    let mut tc2 = TestContext::new(2, 1);
    tc2.fill_input(0, 0.9);
    tc2.fill_input(1, 0.0); // no trigger
    tc2.process(&mut sh).unwrap();

    assert!(
        tc2.output(0)[0].abs() < 1e-6,
        "After reset, held value should be 0"
    );
}

// ─── Quantizer tests ──────────────────────────────────────────────────────

#[test]
fn test_quantizer_chromatic() {
    let mut quant = QuantizerNode::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 0.0) // chromatic
        .with_param("root", 0.0);
    // Input: 60.3 (should snap to 60.0).
    tc.fill_input(0, 60.3);

    tc.process(&mut quant).unwrap();
    assert!(
        (tc.output(0)[0] - 60.0).abs() < 0.01,
        "Chromatic: 60.3 should snap to 60, got {}",
        tc.output(0)[0]
    );
}

#[test]
fn test_quantizer_chromatic_round_up() {
    let mut quant = QuantizerNode::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 0.0)
        .with_param("root", 0.0);
    tc.fill_input(0, 60.7);

    tc.process(&mut quant).unwrap();
    assert!(
        (tc.output(0)[0] - 61.0).abs() < 0.01,
        "Chromatic: 60.7 should snap to 61, got {}",
        tc.output(0)[0]
    );
}

#[test]
fn test_quantizer_major_scale() {
    let mut quant = QuantizerNode::new();

    // C major scale degrees from C4 (60): C(60), D(62), E(64), F(65), G(67), A(69), B(71).
    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 1.0) // major
        .with_param("root", 0.0); // C

    // Test snapping 61 (C#) — should snap to C(60) or D(62), whichever is closer.
    // 61 is equidistant; algorithm picks 60 (lower).
    tc.fill_input(0, 61.0);
    tc.process(&mut quant).unwrap();
    let result = tc.output(0)[0];
    // Should be either 60 or 62 (nearest major scale notes to 61).
    assert!(
        (result - 60.0).abs() < 0.01 || (result - 62.0).abs() < 0.01,
        "Major: 61 should snap to 60 or 62, got {result}"
    );
}

#[test]
fn test_quantizer_minor_scale() {
    let mut quant = QuantizerNode::new();

    // C minor: C(0), D(2), Eb(3), F(5), G(7), Ab(8), Bb(10)
    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 2.0) // minor
        .with_param("root", 0.0);

    // Test snapping 61 (C#) — in C minor, should snap to C(60) or D(62).
    tc.fill_input(0, 61.0);
    tc.process(&mut quant).unwrap();
    let result = tc.output(0)[0];
    assert!(
        (result - 60.0).abs() < 0.01 || (result - 62.0).abs() < 0.01,
        "Minor: 61 should snap to 60 or 62, got {result}"
    );

    // Test snapping 64 (E) — in C minor, Eb is degree 3, so 63; E(64) should snap to Eb(63) or F(65).
    let mut tc2 = TestContext::new(1, 1)
        .with_param("scale", 2.0)
        .with_param("root", 0.0);
    tc2.fill_input(0, 64.0);
    tc2.process(&mut quant).unwrap();
    let result2 = tc2.output(0)[0];
    assert!(
        (result2 - 63.0).abs() < 0.01 || (result2 - 65.0).abs() < 0.01,
        "Minor: 64 should snap to 63 or 65, got {result2}"
    );
}

#[test]
fn test_quantizer_pentatonic_scale() {
    let mut quant = QuantizerNode::new();

    // C major pentatonic: C(0), D(2), E(4), G(7), A(9)
    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 3.0) // pentatonic
        .with_param("root", 0.0);

    // Test snapping 65 (F) — in C pentatonic, nearest are E(64) and G(67).
    // 65 is 1 away from 64, 2 away from 67. Should snap to 64.
    tc.fill_input(0, 65.0);
    tc.process(&mut quant).unwrap();
    let result = tc.output(0)[0];
    assert!(
        (result - 64.0).abs() < 0.01,
        "Pentatonic: 65 should snap to 64 (E), got {result}"
    );
}

#[test]
fn test_quantizer_with_root() {
    let mut quant = QuantizerNode::new();

    // D major (root=2): D(2), E(4), F#(6), G(7), A(9), B(11), C#(13/1).
    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 1.0) // major
        .with_param("root", 2.0); // D

    // 60 = C4. In D major, nearest scale tones around C are B3(59) or C#4(61).
    // Actually D major from root=2: offsets 0,2,4,5,7,9,11 applied from D.
    // So the scale notes near 60: D+11=61 (C#), D+9=59+12=71? No...
    // Let's think: root=2 means scale = 2,4,6,7,9,11,1 (mod 12).
    // 60 mod 12 = 0. Nearest scale degrees in the octave: 11 (=B) distance 1, or 1 (=C#) distance 1.
    // Either is fine.
    tc.fill_input(0, 60.0);
    tc.process(&mut quant).unwrap();
    let result = tc.output(0)[0];
    // Should snap to 59 (B) or 61 (C#).
    assert!(
        (result - 59.0).abs() < 0.01 || (result - 61.0).abs() < 0.01,
        "D major: 60 should snap to 59 or 61, got {result}"
    );
}

#[test]
fn test_quantizer_passthrough_on_scale() {
    let mut quant = QuantizerNode::new();

    // If input is already on a scale degree, it should pass through unchanged.
    let mut tc = TestContext::new(1, 1)
        .with_param("scale", 1.0) // major
        .with_param("root", 0.0);

    // C4 = 60, which is C (degree 0 of C major).
    tc.fill_input(0, 60.0);
    tc.process(&mut quant).unwrap();
    assert!(
        (tc.output(0)[0] - 60.0).abs() < 0.01,
        "On-scale note should pass through, got {}",
        tc.output(0)[0]
    );
}

// ─── Registry tests for Wave 2 + 3 ────────────────────────────────────────

#[test]
fn test_registry_wave2_nodes() {
    let registry = NodeRegistry::with_wave2();

    let wave2_types = ["delay", "reverb", "compressor", "eq"];
    for type_name in &wave2_types {
        assert!(
            registry.has_type(type_name),
            "Wave 2 registry should have '{type_name}'"
        );
        assert!(
            registry.create(type_name).is_some(),
            "Wave 2 registry should create '{type_name}'"
        );
    }

    // Should also have Wave 1 nodes.
    assert!(registry.has_type("oscillator"));
    assert!(registry.has_type("filter"));
}

#[test]
fn test_registry_wave3_nodes() {
    let registry = NodeRegistry::with_wave3();

    let wave3_types = ["euclidean", "noise", "sample_and_hold", "quantizer"];
    for type_name in &wave3_types {
        assert!(
            registry.has_type(type_name),
            "Wave 3 registry should have '{type_name}'"
        );
        assert!(
            registry.create(type_name).is_some(),
            "Wave 3 registry should create '{type_name}'"
        );
    }

    // Should also have Wave 1 and Wave 2 nodes.
    assert!(registry.has_type("oscillator"));
    assert!(registry.has_type("delay"));
}

#[test]
fn test_registry_with_all() {
    let registry = NodeRegistry::with_all();

    // Wave 1: 10, Wave 2: 4, Wave 3: 9, Wave 4: 7, Wave 5: 7 = 37 total.
    assert_eq!(
        registry.len(),
        37,
        "with_all() should register 37 nodes, got {}",
        registry.len()
    );

    let all_types = [
        "oscillator", "filter", "gain", "envelope", "lfo", "mixer", "output", "midi_to_freq", "note_to_freq", "expression",
        "delay", "reverb", "compressor", "eq",
        "euclidean", "noise", "sample_and_hold", "quantizer",
        "step_sequencer", "gravity_sequencer", "game_of_life_sequencer", "markov_sequencer", "polyrhythm",
        "crossfader", "waveshaper", "ring_modulator", "chorus", "phaser", "granular", "vocoder",
        "pitch_shifter", "limiter", "gate", "stereo", "dc_blocker", "convolution_reverb", "spectral",
    ];
    for type_name in &all_types {
        assert!(
            registry.has_type(type_name),
            "with_all() registry should have '{type_name}'"
        );
    }
}

#[test]
fn test_all_wave2_wave3_nodes_instantiate_from_factory() {
    let registry = NodeRegistry::with_all();

    let new_node_types = [
        "delay", "reverb", "compressor", "eq",
        "euclidean", "noise", "sample_and_hold", "quantizer",
    ];

    for type_name in &new_node_types {
        let node = registry.create(type_name);
        assert!(
            node.is_some(),
            "Factory should create node for '{type_name}'"
        );
        // Verify the node can be processed without panic.
        let mut node = node.unwrap();
        let mut tc = TestContext::new(2, 2);
        tc.fill_input(0, 0.0);
        tc.fill_input(1, 0.0);
        let result = tc.process(node.as_mut());
        assert!(
            result.is_ok(),
            "Node '{type_name}' should process without error"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 4 — Advanced Modulation & Routing Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── CrossFader tests ─────────────────────────────────────────────────────

#[test]
fn test_crossfader_position_zero_is_input_a() {
    let mut xf = CrossFader::new();

    let mut tc = TestContext::new(2, 1).with_param("position", 0.0);
    tc.fill_input(0, 0.8); // Input A
    tc.fill_input(1, 0.2); // Input B

    // Let smoothing settle.
    for _ in 0..4 {
        tc.process(&mut xf).unwrap();
    }

    let output = tc.output(0);
    for &s in &output[64..] {
        assert!(
            (s - 0.8).abs() < 0.05,
            "Position=0 should output A (0.8), got {s}"
        );
    }
}

#[test]
fn test_crossfader_position_one_is_input_b() {
    let mut xf = CrossFader::new();

    let mut tc = TestContext::new(2, 1).with_param("position", 1.0);
    tc.fill_input(0, 0.8); // Input A
    tc.fill_input(1, 0.2); // Input B

    // Let smoothing settle.
    for _ in 0..4 {
        tc.process(&mut xf).unwrap();
    }

    let output = tc.output(0);
    for &s in &output[64..] {
        assert!(
            (s - 0.2).abs() < 0.05,
            "Position=1 should output B (0.2), got {s}"
        );
    }
}

#[test]
fn test_crossfader_position_half_is_equal_mix() {
    let mut xf = CrossFader::new();

    let mut tc = TestContext::new(2, 1).with_param("position", 0.5);
    tc.fill_input(0, 1.0); // Input A
    tc.fill_input(1, 0.0); // Input B

    // SmoothedParam starts at 0.5, so should already be settled.
    tc.process(&mut xf).unwrap();

    let output = tc.output(0);
    // At position=0.5: output = 1.0 * 0.5 + 0.0 * 0.5 = 0.5
    for &s in output {
        assert!(
            (s - 0.5).abs() < 0.05,
            "Position=0.5 should give equal mix (0.5), got {s}"
        );
    }
}

#[test]
fn test_crossfader_reset() {
    let mut xf = CrossFader::new();

    let mut tc = TestContext::new(2, 1).with_param("position", 0.0);
    tc.fill_input(0, 1.0);
    tc.fill_input(1, 0.0);
    for _ in 0..4 {
        tc.process(&mut xf).unwrap();
    }

    xf.reset();

    // After reset, smoothed_position should be back to default (0.5).
    let mut tc2 = TestContext::new(2, 1).with_param("position", 0.5);
    tc2.fill_input(0, 1.0);
    tc2.fill_input(1, 0.0);
    tc2.process(&mut xf).unwrap();

    let output = tc2.output(0);
    for &s in output {
        assert!(
            (s - 0.5).abs() < 0.05,
            "After reset, position=0.5 should give 0.5, got {s}"
        );
    }
}

// ─── Waveshaper tests ─────────────────────────────────────────────────────

#[test]
fn test_waveshaper_clips_above_drive() {
    let mut ws = Waveshaper::new();

    // Hard clip mode with high drive — should clip the signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("drive", 10.0)
        .with_param("mix", 1.0)
        .with_param("mode", 1.0); // hard clip
    tc.fill_input(0, 0.5); // 0.5 * 10 = 5.0, hard clipped to 1.0.

    tc.process(&mut ws).unwrap();

    let output = tc.output(0);
    for &s in output {
        assert!(
            (s - 1.0).abs() < 0.01,
            "Hard clip with drive=10 should clip to 1.0, got {s}"
        );
    }
}

#[test]
fn test_waveshaper_soft_clip_saturates() {
    let mut ws = Waveshaper::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("drive", 5.0)
        .with_param("mix", 1.0)
        .with_param("mode", 0.0); // soft clip
    tc.fill_input(0, 0.5); // 0.5 * 5 = 2.5, soft clipped.

    tc.process(&mut ws).unwrap();

    let output = tc.output(0);
    // Soft clip should be close to 1.0 for values above 1.
    for &s in output {
        assert!(s > 0.9, "Soft clip at drive=5 should saturate near 1.0, got {s}");
        assert!(s <= 1.0 + 1e-6, "Soft clip should not exceed 1.0, got {s}");
    }
}

#[test]
fn test_waveshaper_tanh_mode() {
    let mut ws = Waveshaper::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("drive", 3.0)
        .with_param("mix", 1.0)
        .with_param("mode", 2.0); // tanh
    tc.fill_input(0, 0.5); // 0.5 * 3 = 1.5, tanh(1.5) ≈ 0.905

    tc.process(&mut ws).unwrap();

    let output = tc.output(0);
    let expected = (1.5_f64).tanh() as f32;
    for &s in output {
        assert!(
            (s - expected).abs() < 0.01,
            "Tanh mode: expected ~{expected}, got {s}"
        );
    }
}

#[test]
fn test_waveshaper_mix_parameter() {
    let mut ws = Waveshaper::new();

    // Mix = 0 should pass through dry signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("drive", 10.0)
        .with_param("mix", 0.0)
        .with_param("mode", 1.0);
    tc.fill_input(0, 0.5);

    tc.process(&mut ws).unwrap();

    for &s in tc.output(0) {
        assert!(
            (s - 0.5).abs() < 0.01,
            "Mix=0 should pass dry signal (0.5), got {s}"
        );
    }
}

// ─── RingModulator tests ──────────────────────────────────────────────────

#[test]
fn test_ring_modulator_output_is_product() {
    let mut rm = RingModulator::new();

    let mut tc = TestContext::new(2, 1).with_param("mix", 1.0);
    // Carrier = 0.5, modulator = 0.6.
    tc.fill_input(0, 0.5);
    tc.fill_input(1, 0.6);

    tc.process(&mut rm).unwrap();

    let output = tc.output(0);
    // Output should be 0.5 * 0.6 = 0.3 at full mix.
    for &s in output {
        assert!(
            (s - 0.3).abs() < 0.01,
            "Ring mod output should be carrier*modulator (0.3), got {s}"
        );
    }
}

#[test]
fn test_ring_modulator_with_varying_signals() {
    let mut rm = RingModulator::new();

    let mut tc = TestContext::new(2, 1).with_param("mix", 1.0);
    for i in 0..BUFFER_SIZE {
        let t = i as f32 / BUFFER_SIZE as f32;
        tc.input_buffers[0][i] = (t * std::f32::consts::TAU * 2.0).sin(); // carrier
        tc.input_buffers[1][i] = (t * std::f32::consts::TAU * 3.0).sin(); // modulator
    }

    tc.process(&mut rm).unwrap();

    // Verify element-wise: output[i] = input_a[i] * input_b[i].
    for i in 0..BUFFER_SIZE {
        let expected = tc.input_buffers[0][i] * tc.input_buffers[1][i];
        assert!(
            (tc.output(0)[i] - expected).abs() < 1e-5,
            "Ring mod output[{i}] should be a*b: expected {expected}, got {}",
            tc.output(0)[i]
        );
    }
}

#[test]
fn test_ring_modulator_mix_parameter() {
    let mut rm = RingModulator::new();

    // Mix=0 should pass dry carrier.
    let mut tc = TestContext::new(2, 1).with_param("mix", 0.0);
    tc.fill_input(0, 0.7);
    tc.fill_input(1, 0.3);

    tc.process(&mut rm).unwrap();

    for &s in tc.output(0) {
        assert!(
            (s - 0.7).abs() < 0.01,
            "Mix=0 should pass carrier (0.7), got {s}"
        );
    }
}

// ─── Chorus tests ─────────────────────────────────────────────────────────

#[test]
fn test_chorus_output_differs_from_dry() {
    let mut chorus = Chorus::new();

    // Generate a 440Hz sine as input.
    let mut osc = Oscillator::new();
    let mut tc_osc = TestContext::new(0, 1)
        .with_param("frequency", 440.0)
        .with_param("waveform", 0.0);
    tc_osc.process(&mut osc).unwrap();

    // Process through chorus with significant depth.
    let mut tc = TestContext::new(1, 1)
        .with_param("rate", 2.0)
        .with_param("depth", 0.8)
        .with_param("voices", 3.0)
        .with_param("mix", 1.0); // fully wet
    tc.set_input(0, tc_osc.output(0));

    // Process several buffers so the delay line is populated.
    for _ in 0..8 {
        tc.set_input(0, tc_osc.output(0));
        tc.process(&mut chorus).unwrap();
        tc_osc.process(&mut osc).unwrap();
    }

    // The wet output should differ from the dry input.
    let dry = tc_osc.output(0);
    let wet = tc.output(0);
    let mut diff_sum = 0.0_f32;
    for i in 0..BUFFER_SIZE {
        diff_sum += (wet[i] - dry[i]).abs();
    }
    let avg_diff = diff_sum / BUFFER_SIZE as f32;
    assert!(
        avg_diff > 0.01,
        "Chorus output should differ from input, avg_diff={avg_diff}"
    );
}

#[test]
fn test_chorus_mix_zero_is_dry() {
    let mut chorus = Chorus::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.5)
        .with_param("voices", 3.0)
        .with_param("mix", 0.0); // fully dry
    tc.fill_input(0, 0.75);

    tc.process(&mut chorus).unwrap();

    for &s in tc.output(0) {
        assert!(
            (s - 0.75).abs() < 0.01,
            "Mix=0 should pass dry signal (0.75), got {s}"
        );
    }
}

#[test]
fn test_chorus_reset() {
    let mut chorus = Chorus::new();

    // Feed signal to populate delay buffer.
    let mut tc = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.5)
        .with_param("voices", 3.0)
        .with_param("mix", 1.0);
    tc.fill_input(0, 1.0);
    for _ in 0..4 {
        tc.process(&mut chorus).unwrap();
    }

    chorus.reset();

    // After reset, processing silence should produce silence.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.5)
        .with_param("voices", 3.0)
        .with_param("mix", 1.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut chorus).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-5, "Chorus after reset+silence should be silent, max={max}");
}

// ─── Phaser tests ─────────────────────────────────────────────────────────

#[test]
fn test_phaser_output_has_phase_shifted_content() {
    let mut phaser = Phaser::new();

    // Generate a 440Hz sine.
    let mut osc = Oscillator::new();
    let mut tc_osc = TestContext::new(0, 1)
        .with_param("frequency", 440.0)
        .with_param("waveform", 0.0);

    // Process several buffers through the phaser to let the all-pass filters settle.
    for _ in 0..8 {
        tc_osc.process(&mut osc).unwrap();
        let mut tc = TestContext::new(1, 1)
            .with_param("rate", 1.0)
            .with_param("depth", 0.8)
            .with_param("stages", 4.0)
            .with_param("feedback", 0.5)
            .with_param("mix", 0.5);
        tc.set_input(0, tc_osc.output(0));
        tc.process(&mut phaser).unwrap();
    }

    // Do a final pass and compare dry vs wet.
    tc_osc.process(&mut osc).unwrap();
    let mut tc_final = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.8)
        .with_param("stages", 4.0)
        .with_param("feedback", 0.5)
        .with_param("mix", 0.5);
    tc_final.set_input(0, tc_osc.output(0));
    tc_final.process(&mut phaser).unwrap();

    // The output should differ from the dry input due to phase shifting.
    let dry = tc_osc.output(0);
    let output = tc_final.output(0);
    let mut diff_sum = 0.0_f32;
    for i in 0..BUFFER_SIZE {
        diff_sum += (output[i] - dry[i]).abs();
    }
    let avg_diff = diff_sum / BUFFER_SIZE as f32;
    assert!(
        avg_diff > 0.01,
        "Phaser output should differ from dry input, avg_diff={avg_diff}"
    );
}

#[test]
fn test_phaser_mix_zero_is_dry() {
    let mut phaser = Phaser::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.5)
        .with_param("stages", 4.0)
        .with_param("feedback", 0.3)
        .with_param("mix", 0.0); // fully dry
    tc.fill_input(0, 0.6);

    tc.process(&mut phaser).unwrap();

    for &s in tc.output(0) {
        assert!(
            (s - 0.6).abs() < 0.01,
            "Mix=0 should pass dry signal (0.6), got {s}"
        );
    }
}

#[test]
fn test_phaser_reset() {
    let mut phaser = Phaser::new();

    // Feed signal.
    let mut tc = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.5)
        .with_param("stages", 6.0)
        .with_param("feedback", 0.5)
        .with_param("mix", 1.0);
    tc.fill_input(0, 1.0);
    for _ in 0..4 {
        tc.process(&mut phaser).unwrap();
    }

    phaser.reset();

    // After reset, processing silence should produce silence.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("rate", 1.0)
        .with_param("depth", 0.5)
        .with_param("stages", 6.0)
        .with_param("feedback", 0.0)
        .with_param("mix", 1.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut phaser).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-5, "Phaser after reset+silence should be silent, max={max}");
}

// ─── Registry tests for Wave 4 ───────────────────────────────────────────

#[test]
fn test_registry_wave4_nodes() {
    let registry = NodeRegistry::with_wave4();

    let wave4_types = ["crossfader", "waveshaper", "ring_modulator", "chorus", "phaser"];
    for type_name in &wave4_types {
        assert!(
            registry.has_type(type_name),
            "Wave 4 registry should have '{type_name}'"
        );
        assert!(
            registry.create(type_name).is_some(),
            "Wave 4 registry should create '{type_name}'"
        );
    }

    // Should also have Wave 1-3 nodes.
    assert!(registry.has_type("oscillator"));
    assert!(registry.has_type("delay"));
    assert!(registry.has_type("euclidean"));
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 5 — Utility & Analysis Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── PitchShifter tests ───────────────────────────────────────────────────

#[test]
fn test_pitch_shifter_zero_semitones_passthrough() {
    let mut ps = PitchShifter::new();

    // Generate a 440Hz sine.
    let mut osc = Oscillator::new();
    let mut tc_osc = TestContext::new(0, 1)
        .with_param("frequency", 440.0)
        .with_param("waveform", 0.0);

    // Fill the pitch shifter buffer first.
    for _ in 0..20 {
        tc_osc.process(&mut osc).unwrap();
        let mut tc = TestContext::new(1, 1)
            .with_param("shift", 0.0)
            .with_param("mix", 1.0);
        tc.set_input(0, tc_osc.output(0));
        tc.process(&mut ps).unwrap();
    }

    // At 0 semitones, the output should be very similar to input (same frequency).
    // Count zero crossings to verify frequency is preserved.
    tc_osc.process(&mut osc).unwrap();
    let mut tc_final = TestContext::new(1, 1)
        .with_param("shift", 0.0)
        .with_param("mix", 1.0);
    tc_final.set_input(0, tc_osc.output(0));
    tc_final.process(&mut ps).unwrap();

    let crossings_in = count_zero_crossings(tc_osc.output(0));
    let crossings_out = count_zero_crossings(tc_final.output(0));

    // Zero-semitone shift should preserve frequency within tolerance.
    let ratio = crossings_out as f32 / crossings_in.max(1) as f32;
    assert!(
        (ratio - 1.0).abs() < 0.3,
        "0 semitone shift should preserve frequency: in={crossings_in}, out={crossings_out}, ratio={ratio}"
    );
}

#[test]
fn test_pitch_shifter_octave_up() {
    let mut ps = PitchShifter::new();

    // Generate a 220Hz sine (low enough to count crossings reliably).
    let mut osc = Oscillator::new();
    let mut tc_osc = TestContext::new(0, 1)
        .with_param("frequency", 220.0)
        .with_param("waveform", 0.0);

    // Fill the buffer.
    for _ in 0..20 {
        tc_osc.process(&mut osc).unwrap();
        let mut tc = TestContext::new(1, 1)
            .with_param("shift", 12.0) // +12 semitones = octave up
            .with_param("mix", 1.0);
        tc.set_input(0, tc_osc.output(0));
        tc.process(&mut ps).unwrap();
    }

    // Measure zero crossings for several buffers.
    let mut crossings_in_total = 0;
    let mut crossings_out_total = 0;
    for _ in 0..4 {
        tc_osc.process(&mut osc).unwrap();
        let mut tc_final = TestContext::new(1, 1)
            .with_param("shift", 12.0)
            .with_param("mix", 1.0);
        tc_final.set_input(0, tc_osc.output(0));
        tc_final.process(&mut ps).unwrap();

        crossings_in_total += count_zero_crossings(tc_osc.output(0));
        crossings_out_total += count_zero_crossings(tc_final.output(0));
    }

    // +12 semitones = double frequency = roughly double zero crossings.
    let ratio = crossings_out_total as f32 / crossings_in_total.max(1) as f32;
    assert!(
        ratio > 1.3,
        "Octave up should roughly double frequency: in={crossings_in_total}, out={crossings_out_total}, ratio={ratio}"
    );
}

#[test]
fn test_pitch_shifter_reset() {
    let mut ps = PitchShifter::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("shift", 0.0)
        .with_param("mix", 1.0);
    tc.fill_input(0, 1.0);
    for _ in 0..4 {
        tc.process(&mut ps).unwrap();
    }

    ps.reset();

    // After reset, processing silence should produce silence.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("shift", 0.0)
        .with_param("mix", 1.0);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut ps).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-5, "PitchShifter after reset+silence should be silent, max={max}");
}

// ─── Limiter tests ────────────────────────────────────────────────────────

#[test]
fn test_limiter_caps_output_at_ceiling() {
    let mut limiter = Limiter::new();

    // Feed a loud signal (amplitude 2.0) with ceiling at 0 dB (1.0 linear).
    let mut tc = TestContext::new(1, 1)
        .with_param("ceiling", 0.0) // 0 dB = 1.0 linear
        .with_param("release", 100.0);
    tc.fill_input(0, 2.0);

    // Process several buffers to let the envelope settle.
    for _ in 0..4 {
        tc.process(&mut limiter).unwrap();
    }

    let output = tc.output(0);
    for &s in output {
        assert!(
            s.abs() <= 1.05, // Small tolerance for envelope settling.
            "Limiter should cap output at ceiling (1.0), got {s}"
        );
    }
}

#[test]
fn test_limiter_passes_below_ceiling() {
    let mut limiter = Limiter::new();

    // Feed a quiet signal below ceiling.
    let mut tc = TestContext::new(1, 1)
        .with_param("ceiling", 0.0)
        .with_param("release", 100.0);
    tc.fill_input(0, 0.3);

    for _ in 0..4 {
        tc.process(&mut limiter).unwrap();
    }

    let output = tc.output(0);
    for &s in &output[64..] {
        assert!(
            (s - 0.3).abs() < 0.05,
            "Below ceiling, signal should pass through (0.3), got {s}"
        );
    }
}

#[test]
fn test_limiter_negative_ceiling() {
    let mut limiter = Limiter::new();

    // Ceiling at -6 dB ≈ 0.5 linear.
    let ceiling_linear = 10.0_f32.powf(-6.0 / 20.0);
    let mut tc = TestContext::new(1, 1)
        .with_param("ceiling", -6.0)
        .with_param("release", 100.0);
    tc.fill_input(0, 1.0); // Amplitude 1.0 is above -6 dB.

    for _ in 0..8 {
        tc.process(&mut limiter).unwrap();
    }

    let output = tc.output(0);
    for &s in &output[64..] {
        assert!(
            s.abs() <= ceiling_linear + 0.05,
            "Limiter at -6dB should cap at ~{ceiling_linear}, got {s}"
        );
    }
}

#[test]
fn test_limiter_reset() {
    let mut limiter = Limiter::new();

    let mut tc = TestContext::new(1, 1)
        .with_param("ceiling", 0.0)
        .with_param("release", 1000.0); // long release
    tc.fill_input(0, 5.0);
    tc.process(&mut limiter).unwrap();

    limiter.reset();

    // After reset, envelope should be zeroed. A quiet signal should pass through.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("ceiling", 0.0)
        .with_param("release", 100.0);
    tc2.fill_input(0, 0.3);
    for _ in 0..4 {
        tc2.process(&mut limiter).unwrap();
    }

    let last = tc2.output(0)[BUFFER_SIZE - 1];
    assert!(
        (last - 0.3).abs() < 0.05,
        "After reset, quiet signal should pass through (0.3), got {last}"
    );
}

// ─── Gate tests ───────────────────────────────────────────────────────────

#[test]
fn test_gate_silences_below_threshold() {
    let mut gate = Gate::new();

    // Very quiet signal, well below -40 dB threshold.
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -40.0)
        .with_param("attack", 0.01)
        .with_param("hold", 0.0)
        .with_param("release", 1.0);
    tc.fill_input(0, 0.001); // About -60 dB, below threshold.

    for _ in 0..4 {
        tc.process(&mut gate).unwrap();
    }

    let output = tc.output(0);
    let max = output.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(
        max < 0.01,
        "Gate should silence signal below threshold, max={max}"
    );
}

#[test]
fn test_gate_passes_above_threshold() {
    let mut gate = Gate::new();

    // Loud signal, well above threshold.
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -40.0)
        .with_param("attack", 0.01)
        .with_param("hold", 50.0)
        .with_param("release", 50.0);
    tc.fill_input(0, 0.5); // About -6 dB, well above -40 dB.

    // Process enough for the gate to open.
    for _ in 0..4 {
        tc.process(&mut gate).unwrap();
    }

    let output = tc.output(0);
    let rms_val = rms(output);
    assert!(
        rms_val > 0.3,
        "Gate should pass signal above threshold, rms={rms_val}"
    );
}

#[test]
fn test_gate_reset() {
    let mut gate = Gate::new();

    // Open the gate.
    let mut tc = TestContext::new(1, 1)
        .with_param("threshold", -40.0)
        .with_param("attack", 0.01)
        .with_param("hold", 0.0)
        .with_param("release", 1.0);
    tc.fill_input(0, 1.0);
    for _ in 0..4 {
        tc.process(&mut gate).unwrap();
    }

    gate.reset();

    // After reset, gate should be closed again. Quiet signal should be silent.
    let mut tc2 = TestContext::new(1, 1)
        .with_param("threshold", -40.0)
        .with_param("attack", 0.01)
        .with_param("hold", 0.0)
        .with_param("release", 1.0);
    tc2.fill_input(0, 0.001);
    tc2.process(&mut gate).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 0.01, "Gate after reset should be closed for quiet signal, max={max}");
}

// ─── Stereo tests ─────────────────────────────────────────────────────────
// The stereo node takes mono input (port 0) + optional width_mod (port 1).
// With mono input, left == right, side == 0, so output == input regardless of width.

#[test]
fn test_stereo_width_zero_is_mono() {
    let mut stereo = Stereo::new();

    // 1 input (audio in), 2 outputs (L/R)
    let mut tc = TestContext::new(1, 2).with_param("width", 0.0);
    tc.fill_input(0, 0.8);

    for _ in 0..4 {
        tc.process(&mut stereo).unwrap();
    }

    // Mono input → both outputs should be 0.8 (mid signal)
    for i in 64..BUFFER_SIZE {
        assert!((tc.output(0)[i] - 0.8).abs() < 0.05, "L should be 0.8");
        assert!((tc.output(1)[i] - 0.8).abs() < 0.05, "R should be 0.8");
    }
}

#[test]
fn test_stereo_width_100_is_passthrough() {
    let mut stereo = Stereo::new();

    let mut tc = TestContext::new(1, 2).with_param("width", 100.0);
    tc.fill_input(0, 0.8);

    tc.process(&mut stereo).unwrap();

    // Mono passthrough: both outputs equal input
    for &s in tc.output(0) {
        assert!((s - 0.8).abs() < 0.05, "Width=100: left should be 0.8, got {s}");
    }
    for &s in tc.output(1) {
        assert!((s - 0.8).abs() < 0.05, "Width=100: right should be 0.8, got {s}");
    }
}

#[test]
fn test_stereo_width_200_is_wide() {
    let mut stereo = Stereo::new();

    // With mono input, side=0, so width doesn't change anything.
    // Output should still be the input value.
    let mut tc = TestContext::new(1, 2).with_param("width", 200.0);
    tc.fill_input(0, 0.7);

    for _ in 0..4 {
        tc.process(&mut stereo).unwrap();
    }

    for i in 64..BUFFER_SIZE {
        assert!((tc.output(0)[i] - 0.7).abs() < 0.05, "L should be 0.7");
        assert!((tc.output(1)[i] - 0.7).abs() < 0.05, "R should be 0.7");
    }
}

#[test]
fn test_stereo_reset() {
    let mut stereo = Stereo::new();

    let mut tc = TestContext::new(2, 2).with_param("width", 0.0);
    tc.fill_input(0, 1.0);
    tc.fill_input(1, 0.0);
    for _ in 0..4 {
        tc.process(&mut stereo).unwrap();
    }

    stereo.reset();

    // After reset, width should be 100% (default).
    let mut tc2 = TestContext::new(2, 2).with_param("width", 100.0);
    tc2.fill_input(0, 0.8);
    tc2.fill_input(1, 0.2);
    tc2.process(&mut stereo).unwrap();

    // Should be passthrough.
    for &s in tc2.output(0) {
        assert!(
            (s - 0.8).abs() < 0.05,
            "After reset, width=100 should pass through, got L={s}"
        );
    }
}

// ─── DCBlocker tests ──────────────────────────────────────────────────────

#[test]
fn test_dc_blocker_removes_dc_offset() {
    let mut dcb = DCBlocker::new();

    // Signal with DC offset: 0.5 (DC) + sine.
    let mut tc = TestContext::new(1, 1);
    for i in 0..BUFFER_SIZE {
        let t = i as f64 / SAMPLE_RATE;
        tc.input_buffers[0][i] = 0.5 + (t * 440.0 * std::f64::consts::TAU).sin() as f32;
    }

    // Process many buffers to let the DC blocker converge.
    for _ in 0..100 {
        tc.process(&mut dcb).unwrap();
    }

    let output = tc.output(0);

    // The mean of the output should be much less than 0.5 (the DC offset).
    let mean: f32 = output.iter().sum::<f32>() / BUFFER_SIZE as f32;
    assert!(
        mean.abs() < 0.1,
        "DC blocker should remove DC offset: mean={mean}, expected near 0"
    );
}

#[test]
fn test_dc_blocker_passes_ac_content() {
    let mut dcb = DCBlocker::new();

    // Pure 440Hz sine (no DC offset).
    let mut tc = TestContext::new(1, 1);
    for i in 0..BUFFER_SIZE {
        let t = i as f64 / SAMPLE_RATE;
        tc.input_buffers[0][i] = (t * 440.0 * std::f64::consts::TAU).sin() as f32;
    }

    // Process enough to settle.
    for _ in 0..20 {
        tc.process(&mut dcb).unwrap();
    }

    let output = tc.output(0);
    let rms_in = rms(&tc.input_buffers[0]);
    let rms_out = rms(output);

    // AC content should pass through with minimal attenuation.
    assert!(
        rms_out > rms_in * 0.8,
        "DC blocker should pass AC content: rms_in={rms_in}, rms_out={rms_out}"
    );
}

#[test]
fn test_dc_blocker_reset() {
    let mut dcb = DCBlocker::new();

    // Feed signal.
    let mut tc = TestContext::new(1, 1);
    tc.fill_input(0, 1.0);
    tc.process(&mut dcb).unwrap();

    dcb.reset();

    // After reset, processing silence should produce silence.
    let mut tc2 = TestContext::new(1, 1);
    tc2.fill_input(0, 0.0);
    tc2.process(&mut dcb).unwrap();

    let max = tc2.output(0).iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max < 1e-5, "DCBlocker after reset+silence should be silent, max={max}");
}

// ─── Registry tests for Wave 5 ───────────────────────────────────────────

#[test]
fn test_registry_wave5_nodes() {
    let registry = NodeRegistry::with_wave5();

    let wave5_types = ["pitch_shifter", "limiter", "gate", "stereo", "dc_blocker"];
    for type_name in &wave5_types {
        assert!(
            registry.has_type(type_name),
            "Wave 5 registry should have '{type_name}'"
        );
        assert!(
            registry.create(type_name).is_some(),
            "Wave 5 registry should create '{type_name}'"
        );
    }

    // Should also have Wave 1-4 nodes.
    assert!(registry.has_type("oscillator"));
    assert!(registry.has_type("delay"));
    assert!(registry.has_type("euclidean"));
    assert!(registry.has_type("crossfader"));
}

#[test]
fn test_all_wave4_wave5_nodes_instantiate_from_factory() {
    let registry = NodeRegistry::with_all();

    let new_node_types = [
        "crossfader", "waveshaper", "ring_modulator", "chorus", "phaser",
        "pitch_shifter", "limiter", "gate", "stereo", "dc_blocker",
    ];

    for type_name in &new_node_types {
        let node = registry.create(type_name);
        assert!(
            node.is_some(),
            "Factory should create node for '{type_name}'"
        );
        // Verify the node can be processed without panic.
        let mut node = node.unwrap();
        let mut tc = TestContext::new(2, 2);
        tc.fill_input(0, 0.0);
        tc.fill_input(1, 0.0);
        let result = tc.process(node.as_mut());
        assert!(
            result.is_ok(),
            "Node '{type_name}' should process without error"
        );
    }
}

// ─── Full Validation: fuzz + stress + NaN/Inf checks ──────────────────────

/// Helper to check that an output buffer contains no NaN or Inf values.
fn assert_no_nan_inf(buf: &[f32], label: &str) {
    for (i, &s) in buf.iter().enumerate() {
        assert!(
            s.is_finite(),
            "{label}: sample {i} is not finite (value={s})"
        );
    }
}

/// Full validation for a single node: fuzz its parameters across the full range,
/// feed various input signals (silence, impulse, DC, loud, noise), and verify
/// no NaN/Inf in outputs and no panics.
fn full_validation(
    node: &mut dyn AudioNode,
    num_inputs: usize,
    num_outputs: usize,
    param_ranges: &[(&str, f32, f32)],
    label: &str,
) {
    let signals: Vec<(&str, f32)> = vec![
        ("silence", 0.0),
        ("dc_low", 0.001),
        ("dc_mid", 0.5),
        ("dc_full", 1.0),
        ("dc_loud", 2.0),
        ("dc_extreme", 10.0),
        ("dc_negative", -1.0),
        ("dc_tiny", 1e-20),
    ];

    let fuzz_points = [0.0f32, 0.25, 0.5, 0.75, 1.0];

    for (sig_name, sig_val) in &signals {
        for &fuzz in &fuzz_points {
            let mut tc = TestContext::new(num_inputs, num_outputs);
            for i in 0..num_inputs {
                tc.fill_input(i, *sig_val);
            }
            for &(name, min, max) in param_ranges {
                let val = min + (max - min) * fuzz;
                tc.params.set(name, val, 0);
            }

            let result = tc.process(node);
            assert!(
                result.is_ok(),
                "{label}: process failed with signal={sig_name}, fuzz={fuzz}: {:?}",
                result.err()
            );

            for out_idx in 0..num_outputs {
                assert_no_nan_inf(
                    tc.output(out_idx),
                    &format!("{label} sig={sig_name} fuzz={fuzz} out={out_idx}"),
                );
            }
        }
    }

    // Stress test: rapid parameter changes with sine input
    for _ in 0..10 {
        let mut tc = TestContext::new(num_inputs, num_outputs);
        for i in 0..num_inputs {
            for j in 0..BUFFER_SIZE {
                tc.input_buffers[i][j] = ((j as f32 * 0.1).sin()) * 0.8;
            }
        }
        for &(name, min, max) in param_ranges {
            let val = min + (max - min) * 0.73;
            tc.params.set(name, val, 0);
        }
        let _ = tc.process(node);
        for out_idx in 0..num_outputs {
            assert_no_nan_inf(
                tc.output(out_idx),
                &format!("{label} stress out={out_idx}"),
            );
        }
    }

    // Reset and post-reset processing
    node.reset();
    let mut tc = TestContext::new(num_inputs, num_outputs);
    for i in 0..num_inputs {
        tc.fill_input(i, 0.5);
    }
    let result = tc.process(node);
    assert!(result.is_ok(), "{label}: post-reset process failed");
    for out_idx in 0..num_outputs {
        assert_no_nan_inf(tc.output(out_idx), &format!("{label} post-reset out={out_idx}"));
    }
}

#[test]
fn full_validation_oscillator() {
    full_validation(
        &mut Oscillator::new(), 3, 1,
        &[("frequency", 0.1, 20000.0), ("detune", -1200.0, 1200.0), ("waveform", 0.0, 3.0)],
        "oscillator",
    );
}

#[test]
fn full_validation_filter() {
    full_validation(
        &mut BiquadFilter::new(), 1, 1,
        &[("cutoff", 20.0, 20000.0), ("resonance", 0.1, 30.0), ("mode", 0.0, 2.0)],
        "filter",
    );
}

#[test]
fn full_validation_gain() {
    full_validation(&mut GainNode::new(), 1, 1, &[("gain", 0.0, 10.0)], "gain");
}

#[test]
fn full_validation_delay() {
    full_validation(
        &mut DelayNode::new(), 2, 2,
        &[("time", 0.001, 2.0), ("feedback", 0.0, 0.99), ("mix", 0.0, 1.0)],
        "delay",
    );
}

#[test]
fn full_validation_reverb() {
    full_validation(
        &mut ReverbNode::new(), 1, 1,
        &[("room_size", 0.0, 1.0), ("damping", 0.0, 1.0), ("mix", 0.0, 1.0)],
        "reverb",
    );
}

#[test]
fn full_validation_compressor() {
    full_validation(
        &mut CompressorNode::new(), 1, 1,
        &[("threshold", -60.0, 0.0), ("ratio", 1.0, 20.0), ("attack", 0.001, 1.0), ("release", 0.01, 2.0)],
        "compressor",
    );
}

#[test]
fn full_validation_eq() {
    full_validation(
        &mut EqNode::new(), 1, 1,
        &[("low_gain", -24.0, 24.0), ("mid_gain", -24.0, 24.0), ("high_gain", -24.0, 24.0)],
        "eq",
    );
}

#[test]
fn full_validation_envelope() {
    full_validation(
        &mut AdsrEnvelope::new(), 1, 1,
        &[("attack", 0.0, 10.0), ("decay", 0.0, 10.0), ("sustain", 0.0, 1.0), ("release", 0.0, 30.0)],
        "envelope",
    );
}

#[test]
fn full_validation_lfo() {
    full_validation(
        &mut Lfo::new(), 0, 1,
        &[("rate", 0.01, 100.0), ("depth", 0.0, 1.0), ("waveform", 0.0, 3.0)],
        "lfo",
    );
}

#[test]
fn full_validation_noise() {
    full_validation(&mut NoiseNode::new(), 0, 1, &[("color", 0.0, 2.0)], "noise");
}

#[test]
fn full_validation_mixer() {
    full_validation(&mut MixerNode::new(), 4, 1, &[], "mixer");
}

#[test]
fn full_validation_chorus() {
    full_validation(
        &mut Chorus::new(), 1, 1,
        &[("rate", 0.1, 10.0), ("depth", 0.0, 1.0), ("mix", 0.0, 1.0)],
        "chorus",
    );
}

#[test]
fn full_validation_phaser() {
    full_validation(
        &mut Phaser::new(), 1, 1,
        &[("rate", 0.1, 10.0), ("depth", 0.0, 1.0), ("mix", 0.0, 1.0)],
        "phaser",
    );
}

#[test]
fn full_validation_waveshaper() {
    full_validation(
        &mut Waveshaper::new(), 1, 1,
        &[("drive", 0.0, 10.0), ("mix", 0.0, 1.0)],
        "waveshaper",
    );
}

#[test]
fn full_validation_ring_modulator() {
    full_validation(
        &mut RingModulator::new(), 2, 1,
        &[("mix", 0.0, 1.0)],
        "ring_modulator",
    );
}

#[test]
fn full_validation_limiter() {
    full_validation(
        &mut Limiter::new(), 1, 1,
        &[("ceiling", -24.0, 0.0), ("release", 0.01, 2.0)],
        "limiter",
    );
}

#[test]
fn full_validation_gate_node() {
    full_validation(
        &mut Gate::new(), 1, 1,
        &[("threshold", -80.0, 0.0), ("attack", 0.0, 1.0), ("hold", 0.0, 1.0), ("release", 0.0, 2.0)],
        "gate",
    );
}

#[test]
fn full_validation_pitch_shifter() {
    full_validation(
        &mut PitchShifter::new(), 1, 1,
        &[("semitones", -24.0, 24.0), ("mix", 0.0, 1.0)],
        "pitch_shifter",
    );
}

#[test]
fn full_validation_crossfader() {
    full_validation(
        &mut CrossFader::new(), 2, 1,
        &[("position", 0.0, 1.0)],
        "crossfader",
    );
}

#[test]
fn full_validation_stereo() {
    full_validation(
        &mut Stereo::new(), 1, 1,
        &[("width", 0.0, 2.0)],
        "stereo",
    );
}

#[test]
fn full_validation_dc_blocker() {
    full_validation(&mut DCBlocker::new(), 1, 1, &[], "dc_blocker");
}

#[test]
fn full_validation_sample_and_hold() {
    full_validation(&mut SampleAndHoldNode::new(), 2, 1, &[], "sample_and_hold");
}

#[test]
fn full_validation_quantizer() {
    full_validation(
        &mut QuantizerNode::new(), 1, 1,
        &[("scale", 0.0, 11.0)],
        "quantizer",
    );
}

#[test]
fn full_validation_granular() {
    full_validation(
        &mut GranularNode::new(), 1, 1,
        &[
            ("grain_size", 0.01, 0.2),
            ("density", 1.0, 50.0),
            ("pitch", -24.0, 24.0),
            ("scatter", 0.0, 1.0),
            ("mix", 0.0, 1.0),
        ],
        "granular",
    );
}

#[test]
fn full_validation_vocoder() {
    full_validation(
        &mut Vocoder::new(), 2, 1,
        &[
            ("bands", 1.0, 16.0),
            ("attack", 1.0, 100.0),
            ("release", 10.0, 500.0),
            ("mix", 0.0, 1.0),
        ],
        "vocoder",
    );
}

#[test]
fn full_validation_convolution_reverb() {
    full_validation(
        &mut ConvolutionReverb::new(), 1, 1,
        &[
            ("decay", 0.1, 5.0),
            ("brightness", 0.0, 1.0),
            ("predelay", 0.0, 100.0),
            ("mix", 0.0, 1.0),
        ],
        "convolution_reverb",
    );
}

#[test]
fn full_validation_spectral() {
    full_validation(
        &mut SpectralNode::new(), 1, 1,
        &[
            ("freeze", 0.0, 1.0),
            ("blur", 0.0, 1.0),
            ("shift", -512.0, 512.0),
            ("mix", 0.0, 1.0),
        ],
        "spectral",
    );
}
