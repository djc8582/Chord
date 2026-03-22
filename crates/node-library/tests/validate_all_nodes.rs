//! Full validation of all 26 registered audio nodes.
//!
//! Runs `NodeTestHarness::full_validation()` on every node type and asserts all pass.

use chord_testing_framework::NodeTestHarness;

const ALL_NODE_TYPES: &[&str] = &[
    // Wave 1 (MVP)
    "oscillator",
    "filter",
    "gain",
    "envelope",
    "lfo",
    "mixer",
    "output",
    "midi_to_freq",
    // Wave 2 (effects)
    "delay",
    "reverb",
    "compressor",
    "eq",
    // Wave 3 (generative)
    "euclidean",
    "noise",
    "sample_and_hold",
    "quantizer",
    // Wave 4 (advanced modulation & routing)
    "crossfader",
    "waveshaper",
    "ring_modulator",
    "chorus",
    "phaser",
    // Wave 5 (utility & analysis)
    "pitch_shifter",
    "limiter",
    "gate",
    "stereo",
    "dc_blocker",
];

#[test]
fn validate_all_nodes() {
    let harness = NodeTestHarness::default_config();
    let mut failed_nodes = Vec::new();

    for &node_type in ALL_NODE_TYPES {
        let report = harness.full_validation(node_type);
        println!("\n{}", report.summary);

        // Print basic problems.
        if !report.basic.problems.is_empty() {
            println!("  Basic problems:");
            for p in &report.basic.problems {
                println!("    [{:?}] {:?}: {}", p.severity, p.category, p.description);
            }
        }

        // Print fuzz problems (only combos that have problems).
        let fuzz_with_problems: Vec<_> = report
            .fuzz_problems
            .iter()
            .filter(|(_, ps)| !ps.is_empty())
            .collect();
        if !fuzz_with_problems.is_empty() {
            println!("  Fuzz problems ({} combos):", fuzz_with_problems.len());
            for (params, problems) in &fuzz_with_problems {
                let param_str: Vec<String> = params.iter().map(|(k, v)| format!("{k}={v:.2}")).collect();
                println!("    Params: [{}]", param_str.join(", "));
                for p in problems {
                    println!("      [{:?}] {:?}: {}", p.severity, p.category, p.description);
                }
            }
        }

        // Print stress problems.
        if !report.stress_problems.is_empty() {
            println!("  Stress problems:");
            for p in &report.stress_problems {
                println!("    [{:?}] {:?}: {}", p.severity, p.category, p.description);
            }
        }

        if !report.passed {
            failed_nodes.push(node_type.to_string());
        }
    }

    if !failed_nodes.is_empty() {
        panic!(
            "\n\nValidation FAILED for {} node(s): {}\n",
            failed_nodes.len(),
            failed_nodes.join(", ")
        );
    }

    println!("\n\nAll {} nodes passed full validation.", ALL_NODE_TYPES.len());
}

/// Focused test for midi_to_freq to see specific failure details.
#[test]
fn validate_midi_to_freq_only() {
    let harness = NodeTestHarness::default_config();
    let report = harness.full_validation("midi_to_freq");
    println!("\n=== MIDI_TO_FREQ DETAILED REPORT ===");
    println!("{}", report.summary);

    println!("\nBasic problems:");
    for p in &report.basic.problems {
        println!("  [{:?}] {:?}: {}", p.severity, p.category, p.description);
    }

    println!("\nBasic stats:");
    for (i, s) in report.basic.stats.iter().enumerate() {
        println!(
            "  Buffer {}: peak={:.4} rms={:.4} dc_offset={:.4} has_nan={} has_inf={} clip_count={} click_count={}",
            i, s.peak, s.rms, s.dc_offset, s.has_nan, s.has_inf, s.clip_count, s.click_count
        );
    }

    println!("\nFuzz results:");
    for (params, problems) in &report.fuzz_problems {
        let param_str: Vec<String> = params.iter().map(|(k, v)| format!("{k}={v:.2}")).collect();
        println!("  Params: [{}] -> {} problems", param_str.join(", "), problems.len());
        for p in problems {
            println!("    [{:?}] {:?}: {}", p.severity, p.category, p.description);
        }
    }

    println!("\nStress problems:");
    for p in &report.stress_problems {
        println!("  [{:?}] {:?}: {}", p.severity, p.category, p.description);
    }

    assert!(report.passed, "midi_to_freq should pass validation");
}
