//! Tests for the chord-diagnostics crate.

use std::time::Duration;

use chord_audio_graph::{NodeId, PortId};
use chord_dsp_runtime::DiagnosticProbe;
use chord_dsp_runtime::AudioBuffer;

use crate::detector::{DetectorConfig, ProblemCategory, ProblemDetector, Severity};
use crate::engine::{DiagnosticConfig, DiagnosticEngine};
use crate::profiler::{PerformanceProfiler, ProfilerConfig};
use crate::report::DiagnosticReport;
use crate::signal_monitor::{SignalMonitor, SignalMonitorConfig};
use crate::stats::{SignalStats, StatsAccumulator};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/// Create an AudioBuffer with a single channel filled with the given samples.
fn make_buffer(samples: &[f32]) -> AudioBuffer {
    let mut buf = AudioBuffer::new(1, samples.len());
    let ch = buf.channel_mut(0);
    ch.copy_from_slice(samples);
    buf
}

/// Create a sine wave buffer.
fn make_sine_buffer(frequency: f32, sample_rate: f32, num_samples: usize, amplitude: f32) -> Vec<f32> {
    (0..num_samples)
        .map(|i| {
            amplitude * (2.0 * std::f32::consts::PI * frequency * i as f32 / sample_rate).sin()
        })
        .collect()
}

// ===========================================================================
// StatsAccumulator tests
// ===========================================================================

#[test]
fn test_stats_accumulator_empty() {
    let acc = StatsAccumulator::new();
    let stats = acc.snapshot();
    assert_eq!(stats.peak, 0.0);
    assert_eq!(stats.rms, 0.0);
    assert_eq!(stats.dc_offset, 0.0);
    assert_eq!(stats.sample_count, 0);
    assert!(!stats.has_nan);
    assert!(!stats.has_inf);
}

#[test]
fn test_rms_calculation_accuracy() {
    let mut acc = StatsAccumulator::new();

    // For a constant signal of 0.5, RMS should be 0.5.
    let samples: Vec<f32> = vec![0.5; 1024];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(
        (stats.rms - 0.5).abs() < 1e-5,
        "Expected RMS ~0.5, got {}",
        stats.rms
    );
    assert!(
        (stats.dc_offset - 0.5).abs() < 1e-5,
        "Expected DC offset ~0.5, got {}",
        stats.dc_offset
    );
}

#[test]
fn test_rms_sine_wave() {
    let mut acc = StatsAccumulator::new();

    // RMS of a pure sine wave with amplitude A is A / sqrt(2).
    let amplitude = 1.0;
    let samples = make_sine_buffer(440.0, 48000.0, 48000, amplitude);
    acc.process_buffer(&samples);
    let stats = acc.snapshot();

    let expected_rms = amplitude / std::f32::consts::SQRT_2;
    assert!(
        (stats.rms - expected_rms).abs() < 0.01,
        "Expected RMS ~{:.4}, got {:.4}",
        expected_rms,
        stats.rms
    );
}

#[test]
fn test_peak_level_calculation() {
    let mut acc = StatsAccumulator::new();
    let samples = vec![0.0, 0.3, -0.7, 0.5, -0.2, 0.9];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(
        (stats.peak - 0.9).abs() < 1e-6,
        "Expected peak 0.9, got {}",
        stats.peak
    );
}

#[test]
fn test_dc_offset_detection() {
    let mut acc = StatsAccumulator::new();

    // Signal with DC offset of 0.3.
    let samples: Vec<f32> = vec![0.3; 1024];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();

    assert!(
        (stats.dc_offset - 0.3).abs() < 1e-5,
        "Expected DC offset ~0.3, got {}",
        stats.dc_offset
    );
}

#[test]
fn test_clipping_detection() {
    let mut acc = StatsAccumulator::new();

    // Samples exceeding 1.0 and -1.0.
    let samples = vec![0.5, 1.5, -2.0, 0.3, 1.1];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();

    assert_eq!(
        stats.clip_count, 3,
        "Expected 3 clipped samples, got {}",
        stats.clip_count
    );
    assert!(
        (stats.peak - 2.0).abs() < 1e-6,
        "Expected peak 2.0, got {}",
        stats.peak
    );
}

#[test]
fn test_nan_detection() {
    let mut acc = StatsAccumulator::new();
    let samples = vec![0.5, f32::NAN, 0.3, f32::NAN, 0.1];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(stats.has_nan, "Should have detected NaN");
}

#[test]
fn test_inf_detection() {
    let mut acc = StatsAccumulator::new();
    let samples = vec![0.5, f32::INFINITY, 0.3, f32::NEG_INFINITY];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(stats.has_inf, "Should have detected Inf");
}

#[test]
fn test_click_detection() {
    let mut acc = StatsAccumulator::new();

    // Discontinuous buffer: sudden jump from 0 to 0.8 (delta = 0.8 > 0.5 threshold).
    let samples = vec![0.0, 0.0, 0.0, 0.8, 0.0, 0.0];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();

    assert!(
        stats.click_count >= 1,
        "Expected at least 1 click, got {}",
        stats.click_count
    );
}

#[test]
fn test_silence_detection() {
    let mut acc = StatsAccumulator::new();

    // All zeros.
    let samples = vec![0.0; 256];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();

    assert_eq!(
        stats.silent_buffer_count, 1,
        "Expected 1 silent buffer, got {}",
        stats.silent_buffer_count
    );

    // Feed another silent buffer.
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert_eq!(
        stats.silent_buffer_count, 2,
        "Expected 2 silent buffers, got {}",
        stats.silent_buffer_count
    );

    // Feed a non-silent buffer. Counter should reset.
    let non_silent = vec![0.5; 256];
    acc.process_buffer(&non_silent);
    let stats = acc.snapshot();
    assert_eq!(
        stats.silent_buffer_count, 0,
        "Expected 0 silent buffers after non-silent input, got {}",
        stats.silent_buffer_count
    );
}

#[test]
fn test_zero_crossing_rate() {
    let mut acc = StatsAccumulator::new();

    // Square wave: alternating +1, -1 — every pair crosses zero.
    let samples: Vec<f32> = (0..100).map(|i| if i % 2 == 0 { 1.0 } else { -1.0 }).collect();
    acc.process_buffer(&samples);
    let stats = acc.snapshot();

    // Every consecutive pair crosses zero: 99 crossings out of 99 transitions.
    assert!(
        (stats.zero_crossing_rate - 1.0).abs() < 0.02,
        "Expected ZCR ~1.0, got {}",
        stats.zero_crossing_rate
    );
}

#[test]
fn test_crest_factor() {
    let mut acc = StatsAccumulator::new();

    // Pure DC signal: crest factor should be 1.0 (peak == RMS).
    let samples = vec![0.5; 1024];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(
        (stats.crest_factor - 1.0).abs() < 0.01,
        "Expected crest factor ~1.0 for DC, got {}",
        stats.crest_factor
    );
}

#[test]
fn test_stats_accumulator_reset() {
    let mut acc = StatsAccumulator::new();
    let samples = vec![0.5; 256];
    acc.process_buffer(&samples);
    assert!(acc.snapshot().sample_count > 0);

    acc.reset();
    let stats = acc.snapshot();
    assert_eq!(stats.sample_count, 0);
    assert_eq!(stats.peak, 0.0);
}

#[test]
fn test_signal_stats_db_conversion() {
    let mut stats = SignalStats::new();
    assert!(stats.peak_db().is_infinite());
    assert!(stats.rms_db().is_infinite());

    stats.peak = 1.0;
    assert!((stats.peak_db() - 0.0).abs() < 0.001);

    stats.peak = 0.5;
    // 20 * log10(0.5) = -6.02 dB
    assert!(
        (stats.peak_db() - (-6.0206)).abs() < 0.01,
        "Expected ~-6.02 dB, got {}",
        stats.peak_db()
    );
}

// ===========================================================================
// ProblemDetector tests
// ===========================================================================

#[test]
fn test_detector_clipping() {
    let mut detector = ProblemDetector::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.clip_count = 5;
    stats.peak = 1.5;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::Clipping),
        "Should detect clipping"
    );
    let clip_problem = problems
        .iter()
        .find(|p| p.category == ProblemCategory::Clipping)
        .unwrap();
    assert_eq!(clip_problem.severity, Severity::Error);
}

#[test]
fn test_detector_nan() {
    let mut detector = ProblemDetector::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.has_nan = true;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::NaN),
        "Should detect NaN"
    );
    let nan_problem = problems
        .iter()
        .find(|p| p.category == ProblemCategory::NaN)
        .unwrap();
    assert_eq!(nan_problem.severity, Severity::Critical);
}

#[test]
fn test_detector_inf() {
    let mut detector = ProblemDetector::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.has_inf = true;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::Infinity),
        "Should detect Infinity"
    );
}

#[test]
fn test_detector_dc_offset() {
    let mut detector = ProblemDetector::new(DetectorConfig {
        dc_offset_threshold: 0.01,
        ..DetectorConfig::default()
    });
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.dc_offset = 0.05;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::DcOffset),
        "Should detect DC offset"
    );
}

#[test]
fn test_detector_click() {
    let mut detector = ProblemDetector::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.click_count = 3;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::Click),
        "Should detect clicks"
    );
}

#[test]
fn test_detector_silence() {
    let mut detector = ProblemDetector::new(DetectorConfig {
        silence_buffer_threshold: 10,
        ..DetectorConfig::default()
    });
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.silent_buffer_count = 15;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::Silence),
        "Should detect prolonged silence"
    );
}

#[test]
fn test_detector_no_false_positives() {
    let mut detector = ProblemDetector::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    // Clean signal — should produce no problems.
    let mut stats = SignalStats::new();
    stats.peak = 0.8;
    stats.rms = 0.5;
    stats.dc_offset = 0.001;
    stats.sample_count = 1024;

    let problems = detector.analyze(node_id, port_id, &stats);
    assert!(
        problems.is_empty(),
        "Clean signal should produce no problems, got {:?}",
        problems.iter().map(|p| &p.category).collect::<Vec<_>>()
    );
}

#[test]
fn test_detector_auto_fix_suggestions() {
    let mut detector = ProblemDetector::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let mut stats = SignalStats::new();
    stats.has_nan = true;

    let problems = detector.analyze(node_id, port_id, &stats);
    let nan_problem = problems
        .iter()
        .find(|p| p.category == ProblemCategory::NaN)
        .unwrap();
    assert!(
        nan_problem.auto_fix.is_some(),
        "NaN problem should have an auto-fix suggestion"
    );
}

// ===========================================================================
// SignalMonitor tests
// ===========================================================================

#[test]
fn test_signal_monitor_basic() {
    let mut monitor = SignalMonitor::new(SignalMonitorConfig {
        history_size: 10,
        snapshot_interval: 1,
    });

    let node_id = NodeId(1);
    let port_id = PortId(1);

    // Feed a buffer.
    let buf = make_buffer(&[0.3, -0.5, 0.8, -0.2]);
    monitor.on_buffer_processed(node_id, port_id, &buf);

    let stats = monitor.get_signal_stats(node_id, port_id);
    assert!(stats.is_some(), "Should have stats after processing");
}

#[test]
fn test_signal_monitor_history() {
    let mut monitor = SignalMonitor::new(SignalMonitorConfig {
        history_size: 5,
        snapshot_interval: 1,
    });

    let node_id = NodeId(1);
    let port_id = PortId(1);

    // Feed 3 buffers.
    for _ in 0..3 {
        let buf = make_buffer(&[0.3, -0.5, 0.8]);
        monitor.on_buffer_processed(node_id, port_id, &buf);
    }

    let history = monitor.get_history(node_id, port_id);
    assert_eq!(history.len(), 3, "Should have 3 snapshots in history");
}

#[test]
fn test_signal_monitor_error_recording() {
    let mut monitor = SignalMonitor::new(SignalMonitorConfig::default());
    let node_id = NodeId(1);

    monitor.on_error(
        node_id,
        chord_dsp_runtime::AudioError::NanDetected { count: 5 },
    );

    let errors = monitor.get_errors();
    assert_eq!(errors.len(), 1);
}

#[test]
fn test_signal_monitor_multiple_ports() {
    let mut monitor = SignalMonitor::new(SignalMonitorConfig {
        history_size: 10,
        snapshot_interval: 1,
    });

    let node_id = NodeId(1);
    let port_a = PortId(1);
    let port_b = PortId(2);

    let buf_a = make_buffer(&[0.5; 64]);
    let buf_b = make_buffer(&[0.8; 64]);

    monitor.on_buffer_processed(node_id, port_a, &buf_a);
    monitor.on_buffer_processed(node_id, port_b, &buf_b);

    let stats_a = monitor.get_signal_stats(node_id, port_a).unwrap();
    let stats_b = monitor.get_signal_stats(node_id, port_b).unwrap();

    assert!(
        (stats_a.peak - 0.5).abs() < 0.01,
        "Port A peak should be ~0.5"
    );
    assert!(
        (stats_b.peak - 0.8).abs() < 0.01,
        "Port B peak should be ~0.8"
    );
}

// ===========================================================================
// PerformanceProfiler tests
// ===========================================================================

#[test]
fn test_profiler_records_timing() {
    let mut profiler = PerformanceProfiler::new(ProfilerConfig {
        sample_rate: 48000.0,
        buffer_size: 256,
        timing_history_size: 64,
        spike_threshold: 0.5,
    });

    let node_id = NodeId(1);
    profiler.record_node_timing(node_id, Duration::from_micros(100));
    profiler.end_buffer();

    let profile = profiler.cpu_profile();
    assert!(
        profile.node_times.contains_key(&1),
        "Should have timing for node 1"
    );
    let timing = &profile.node_times[&1];
    assert!(
        (timing.latest_us - 100.0).abs() < 1.0,
        "Expected ~100us, got {}",
        timing.latest_us
    );
}

#[test]
fn test_profiler_dsp_load() {
    let mut profiler = PerformanceProfiler::new(ProfilerConfig {
        sample_rate: 48000.0,
        buffer_size: 256,
        timing_history_size: 64,
        spike_threshold: 0.5,
    });

    // Buffer duration = 256 / 48000 = ~5.333ms = ~5333us.
    let node_a = NodeId(1);
    let node_b = NodeId(2);
    profiler.record_node_timing(node_a, Duration::from_micros(1000));
    profiler.record_node_timing(node_b, Duration::from_micros(1000));
    profiler.end_buffer();

    let profile = profiler.cpu_profile();
    // Total = 2000us, buffer = 5333us => load = 2000/5333 * 100 = ~37.5%
    assert!(
        profile.dsp_load_percent > 30.0 && profile.dsp_load_percent < 45.0,
        "Expected DSP load ~37.5%, got {:.1}%",
        profile.dsp_load_percent
    );
}

#[test]
fn test_profiler_underrun_detection() {
    let mut profiler = PerformanceProfiler::new(ProfilerConfig {
        sample_rate: 48000.0,
        buffer_size: 256,
        timing_history_size: 64,
        spike_threshold: 0.5,
    });

    // Simulate an underrun: processing takes longer than the buffer duration.
    let node_id = NodeId(1);
    profiler.record_node_timing(node_id, Duration::from_millis(10)); // > 5.33ms
    profiler.end_buffer();

    assert_eq!(
        profiler.underrun_count(),
        1,
        "Should detect one underrun"
    );

    let profile = profiler.cpu_profile();
    assert!(
        profile.dsp_load_percent > 100.0,
        "DSP load should exceed 100% during underrun"
    );
}

#[test]
fn test_profiler_spike_detection() {
    let mut profiler = PerformanceProfiler::new(ProfilerConfig {
        sample_rate: 48000.0,
        buffer_size: 256,
        timing_history_size: 64,
        spike_threshold: 0.5, // 50% of buffer duration
    });

    let node_id = NodeId(1);
    // 50% of 5333us = 2666us. Record 3000us => spike.
    profiler.record_node_timing(node_id, Duration::from_micros(3000));
    profiler.end_buffer();

    assert!(
        profiler.is_node_spiking(node_id),
        "Node should be detected as spiking"
    );

    // Non-spiking node.
    let node_b = NodeId(2);
    assert!(
        !profiler.is_node_spiking(node_b),
        "Unknown node should not be spiking"
    );
}

#[test]
fn test_profiler_multiple_buffers() {
    let mut profiler = PerformanceProfiler::new(ProfilerConfig {
        sample_rate: 48000.0,
        buffer_size: 256,
        timing_history_size: 64,
        spike_threshold: 0.5,
    });

    let node_id = NodeId(1);
    for i in 0..10 {
        profiler.record_node_timing(node_id, Duration::from_micros(100 + i * 10));
        profiler.end_buffer();
    }

    assert_eq!(profiler.total_buffers(), 10);
    let profile = profiler.cpu_profile();
    let timing = &profile.node_times[&1];
    assert_eq!(timing.call_count, 10);
    assert!(timing.average_us > 0.0);
}

#[test]
fn test_profiler_reset() {
    let mut profiler = PerformanceProfiler::new(ProfilerConfig::default());
    let node_id = NodeId(1);
    profiler.record_node_timing(node_id, Duration::from_micros(100));
    profiler.end_buffer();

    profiler.reset();
    assert_eq!(profiler.total_buffers(), 0);
    assert_eq!(profiler.underrun_count(), 0);
    let profile = profiler.cpu_profile();
    assert!(profile.node_times.is_empty());
}

// ===========================================================================
// DiagnosticEngine integration tests
// ===========================================================================

#[test]
fn test_engine_full_pipeline() {
    let mut engine = DiagnosticEngine::new(DiagnosticConfig {
        signal_monitor: SignalMonitorConfig {
            history_size: 10,
            snapshot_interval: 1,
        },
        detector: DetectorConfig::default(),
        profiler: ProfilerConfig {
            sample_rate: 48000.0,
            buffer_size: 256,
            ..ProfilerConfig::default()
        },
    });

    let node_id = NodeId(1);
    let port_id = PortId(1);

    // Feed a clipping buffer.
    let buf = make_buffer(&[0.5, 1.5, -2.0, 0.3, 1.1]);
    engine.on_buffer_processed(node_id, port_id, &buf);

    // Record timing.
    engine.record_node_timing(node_id, Duration::from_micros(100));
    engine.end_buffer();

    // Check signal stats.
    let stats = engine.get_signal_stats(node_id, port_id);
    assert!(stats.is_some());
    let stats = stats.unwrap();
    assert_eq!(stats.clip_count, 3);

    // Check problems.
    let problems = engine.get_problems();
    assert!(
        problems.iter().any(|p| p.category == ProblemCategory::Clipping),
        "Should detect clipping"
    );

    // Check CPU profile.
    let profile = engine.get_cpu_profile();
    assert!(profile.node_times.contains_key(&1));
}

#[test]
fn test_engine_full_diagnostic_report() {
    let mut engine = DiagnosticEngine::default();

    let node_id = NodeId(1);
    let port_id = PortId(1);

    // Feed buffers with various issues.
    let clipping_buf = make_buffer(&[1.5, -2.0, 0.5]);
    engine.on_buffer_processed(node_id, port_id, &clipping_buf);

    let report = engine.run_full_diagnostic();
    assert!(!report.signal_stats.is_empty());
    assert!(!report.problems.is_empty());
    assert!(report.summary.total_problems > 0);
}

#[test]
fn test_engine_reset() {
    let mut engine = DiagnosticEngine::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let buf = make_buffer(&[0.5; 64]);
    engine.on_buffer_processed(node_id, port_id, &buf);

    engine.reset();
    assert!(engine.get_signal_stats(node_id, port_id).is_none());
}

// ===========================================================================
// DiagnosticReport serialization tests
// ===========================================================================

#[test]
fn test_report_serialization_roundtrip() {
    let mut engine = DiagnosticEngine::new(DiagnosticConfig {
        signal_monitor: SignalMonitorConfig {
            history_size: 10,
            snapshot_interval: 1,
        },
        detector: DetectorConfig::default(),
        profiler: ProfilerConfig::default(),
    });

    let node_id = NodeId(1);
    let port_id = PortId(1);

    // Feed some data to produce a non-trivial report.
    let buf = make_buffer(&[0.5, 1.5, -0.3, 0.8]);
    engine.on_buffer_processed(node_id, port_id, &buf);
    engine.record_node_timing(node_id, Duration::from_micros(50));
    engine.end_buffer();

    let report = engine.run_full_diagnostic();

    // Serialize to JSON.
    let json = serde_json::to_string_pretty(&report).expect("Failed to serialize report");
    assert!(!json.is_empty());

    // Deserialize back.
    let deserialized: DiagnosticReport =
        serde_json::from_str(&json).expect("Failed to deserialize report");

    // Verify key fields survived the roundtrip.
    assert_eq!(
        deserialized.signal_stats.len(),
        report.signal_stats.len()
    );
    assert_eq!(deserialized.problems.len(), report.problems.len());
    assert_eq!(
        deserialized.summary.total_problems,
        report.summary.total_problems
    );
    assert!(
        (deserialized.cpu_profile.dsp_load_percent - report.cpu_profile.dsp_load_percent).abs()
            < 0.01
    );
}

#[test]
fn test_signal_stats_serialization() {
    let stats = SignalStats {
        peak: 0.95,
        rms: 0.5,
        dc_offset: 0.001,
        crest_factor: 1.9,
        zero_crossing_rate: 0.45,
        has_nan: false,
        has_inf: false,
        click_count: 0,
        sample_count: 48000,
        clip_count: 0,
        silent_buffer_count: 0,
    };

    let json = serde_json::to_string(&stats).expect("Failed to serialize");
    let deserialized: SignalStats = serde_json::from_str(&json).expect("Failed to deserialize");
    assert!((deserialized.peak - stats.peak).abs() < 1e-6);
    assert!((deserialized.rms - stats.rms).abs() < 1e-6);
    assert_eq!(deserialized.sample_count, stats.sample_count);
}

#[test]
fn test_empty_report_serialization() {
    let report = DiagnosticReport::new();
    let json = serde_json::to_string(&report).expect("Failed to serialize empty report");
    let deserialized: DiagnosticReport =
        serde_json::from_str(&json).expect("Failed to deserialize empty report");
    assert!(deserialized.problems.is_empty());
    assert!(deserialized.signal_stats.is_empty());
}

// ===========================================================================
// Overhead / performance tests
// ===========================================================================

#[test]
fn test_diagnostics_overhead() {
    // Measure the overhead of running diagnostics on a realistic buffer.
    // Target: < 0.1% CPU overhead.
    let mut engine = DiagnosticEngine::default();
    let node_id = NodeId(1);
    let port_id = PortId(1);

    let samples = make_sine_buffer(440.0, 48000.0, 256, 0.8);
    let buf = make_buffer(&samples);

    // Warm up.
    for _ in 0..100 {
        engine.on_buffer_processed(node_id, port_id, &buf);
    }

    // Measure time for 10000 diagnostic calls.
    let start = std::time::Instant::now();
    let iterations = 10_000;
    for _ in 0..iterations {
        engine.on_buffer_processed(node_id, port_id, &buf);
    }
    let elapsed = start.elapsed();

    // Buffer duration = 256 / 48000 = ~5.333ms.
    // Total real-time duration for 10000 buffers = ~53.33 seconds.
    let buffer_duration_s = 256.0 / 48000.0;
    let total_realtime = buffer_duration_s * iterations as f64;
    let overhead_fraction = elapsed.as_secs_f64() / total_realtime;
    let overhead_percent = overhead_fraction * 100.0;

    assert!(
        overhead_percent < 5.0, // Allow generous margin in test; real target is < 0.1%
        "Diagnostics overhead was {:.3}% — exceeds 5% test threshold",
        overhead_percent,
    );

    // Log for informational purposes.
    eprintln!(
        "Diagnostics overhead: {:.4}% ({:.2}us per buffer of {:.2}ms)",
        overhead_percent,
        elapsed.as_secs_f64() / iterations as f64 * 1_000_000.0,
        buffer_duration_s * 1000.0,
    );
}

#[test]
fn test_multi_node_overhead() {
    // Test overhead with multiple nodes (simulating a 100-node graph).
    let mut engine = DiagnosticEngine::new(DiagnosticConfig {
        signal_monitor: SignalMonitorConfig {
            history_size: 100,
            snapshot_interval: 1,
        },
        detector: DetectorConfig::default(),
        profiler: ProfilerConfig::default(),
    });

    let samples = make_sine_buffer(440.0, 48000.0, 256, 0.5);
    let buf = make_buffer(&samples);

    let num_nodes = 100;
    let iterations = 1000;

    // Warm up.
    for _ in 0..10 {
        for n in 0..num_nodes {
            engine.on_buffer_processed(NodeId(n), PortId(0), &buf);
        }
    }

    let start = std::time::Instant::now();
    for _ in 0..iterations {
        for n in 0..num_nodes {
            engine.on_buffer_processed(NodeId(n), PortId(0), &buf);
        }
    }
    let elapsed = start.elapsed();

    let buffer_duration_s = 256.0 / 48000.0;
    let total_realtime = buffer_duration_s * iterations as f64;
    let overhead_fraction = elapsed.as_secs_f64() / total_realtime;
    let overhead_percent = overhead_fraction * 100.0;

    assert!(
        overhead_percent < 20.0, // Generous margin for CI; 100 nodes * overhead per node
        "100-node diagnostics overhead was {:.3}% — exceeds 20% test threshold",
        overhead_percent,
    );

    eprintln!(
        "100-node diagnostics overhead: {:.4}% ({:.2}us per buffer of {:.2}ms)",
        overhead_percent,
        elapsed.as_secs_f64() / iterations as f64 * 1_000_000.0,
        buffer_duration_s * 1000.0,
    );
}

// ===========================================================================
// Edge case tests
// ===========================================================================

#[test]
fn test_empty_buffer_handling() {
    let mut acc = StatsAccumulator::new();
    acc.process_buffer(&[]);
    let stats = acc.snapshot();
    assert_eq!(stats.sample_count, 0);
}

#[test]
fn test_single_sample_buffer() {
    let mut acc = StatsAccumulator::new();
    acc.process_buffer(&[0.75]);
    let stats = acc.snapshot();
    assert_eq!(stats.sample_count, 1);
    assert!((stats.peak - 0.75).abs() < 1e-6);
    assert!((stats.rms - 0.75).abs() < 1e-6);
}

#[test]
fn test_all_nan_buffer() {
    let mut acc = StatsAccumulator::new();
    let samples = vec![f32::NAN; 64];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(stats.has_nan);
    // Peak and RMS should remain 0 since NaN samples are skipped.
    assert_eq!(stats.peak, 0.0);
}

#[test]
fn test_mixed_nan_and_valid() {
    let mut acc = StatsAccumulator::new();
    let samples = vec![0.5, f32::NAN, 0.3, f32::NAN, 0.8];
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert!(stats.has_nan);
    assert!((stats.peak - 0.8).abs() < 1e-6);
}

#[test]
fn test_very_large_buffer() {
    let mut acc = StatsAccumulator::new();
    let samples: Vec<f32> = (0..8192).map(|i| (i as f32 / 8192.0) * 2.0 - 1.0).collect();
    acc.process_buffer(&samples);
    let stats = acc.snapshot();
    assert_eq!(stats.sample_count, 8192);
    assert!(stats.peak > 0.99);
}

#[test]
fn test_report_health_score() {
    let mut report = DiagnosticReport::new();
    report.compute_summary();
    assert!((report.summary.health_score - 1.0).abs() < 1e-6, "Empty report should have perfect health");

    // Add a critical problem.
    report.problems.push(crate::detector::Problem {
        id: crate::detector::ProblemId(1),
        severity: Severity::Critical,
        category: ProblemCategory::NaN,
        node_id: NodeId(1),
        port_id: Some(PortId(1)),
        description: "test".to_string(),
        auto_fix: None,
    });
    report.compute_summary();
    assert!(
        report.summary.health_score < 1.0,
        "Report with critical problem should have reduced health"
    );
    assert_eq!(report.summary.critical_count, 1);
}

#[test]
fn test_accumulator_across_buffer_boundaries() {
    let mut acc = StatsAccumulator::new();

    // Feed a buffer ending at 0.0.
    acc.process_buffer(&[0.0, 0.1, 0.2, 0.0]);

    // Feed another buffer starting with a big jump — should detect click across boundary.
    acc.process_buffer(&[0.9, 0.1, 0.0]);

    let stats = acc.snapshot();
    // The jump from 0.0 to 0.9 (delta=0.9) should be detected as a click.
    assert!(
        stats.click_count >= 1,
        "Should detect click across buffer boundary, got {}",
        stats.click_count
    );
}

#[test]
fn test_profiler_buffer_duration_computation() {
    let profiler = PerformanceProfiler::new(ProfilerConfig {
        sample_rate: 44100.0,
        buffer_size: 512,
        ..ProfilerConfig::default()
    });

    let expected_duration = Duration::from_secs_f64(512.0 / 44100.0);
    let actual = profiler.buffer_duration();
    let diff = if actual > expected_duration {
        actual - expected_duration
    } else {
        expected_duration - actual
    };
    assert!(
        diff < Duration::from_nanos(100),
        "Buffer duration mismatch: expected {:?}, got {:?}",
        expected_duration,
        actual
    );
}
