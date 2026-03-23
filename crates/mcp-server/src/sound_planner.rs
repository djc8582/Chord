//! Sound-to-Synthesis Planner
//! Takes a SoundAnalysis and produces a PatchRecipe that recreates the sound.

use crate::vibe::{LayerRecipe, LayerRole, PatchRecipe};
use chord_diagnostics::analysis::SoundAnalysis;
use std::collections::HashMap;

/// Plan a synthesis patch based on sound analysis
pub fn plan_synthesis(analysis: &SoundAnalysis) -> PatchRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Synthesized Sound".into();
    recipe.description = format!(
        "Recreated from analysis: {}pitched, {}, f0={:.0}Hz",
        if analysis.is_pitched { "" } else { "un" },
        if analysis.is_percussive {
            "percussive"
        } else if analysis.is_sustained {
            "sustained"
        } else {
            "transient"
        },
        analysis.fundamental_freq.unwrap_or(0.0)
    );

    // ── Source Selection ──
    if analysis.is_pitched && analysis.inharmonicity < 0.05 {
        // Clean pitched: subtractive synthesis (saw → filter)
        let waveform = if analysis.harmonics.len() > 6 { 1 } else { 0 }; // saw or sine
        recipe.layers.push(LayerRecipe {
            role: LayerRole::Pad,
            node_type: "oscillator".into(),
            octave: freq_to_octave(analysis.fundamental_freq.unwrap_or(440.0)),
            waveform: waveform as u32,
            volume: 0.5,
            filter_cutoff: analysis.spectral_centroid.clamp(200.0, 10000.0),
            filter_resonance: 1.5,
            sequencer: None,
            sequencer_params: HashMap::new(),
            extra_params: {
                let mut p = HashMap::new();
                if let Some(f0) = analysis.fundamental_freq {
                    p.insert("frequency".into(), f0);
                }
                p
            },
        });
    } else if analysis.is_pitched && analysis.inharmonicity >= 0.05 {
        // Inharmonic pitched (bells, metallic): use multiple detuned oscs
        for harmonic in analysis.harmonics.iter().take(4) {
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Pad,
                node_type: "oscillator".into(),
                octave: freq_to_octave(harmonic.frequency),
                waveform: 0, // sine for each partial
                volume: harmonic.amplitude * 0.3,
                filter_cutoff: 10000.0,
                filter_resonance: 0.5,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: {
                    let mut p = HashMap::new();
                    p.insert("frequency".into(), harmonic.frequency);
                    p
                },
            });
        }
    }

    if analysis.is_noisy {
        // Add noise layer
        let noise_vol = analysis.noise_ratio * 0.4;
        recipe.layers.push(LayerRecipe {
            role: LayerRole::Texture,
            node_type: "noise".into(),
            octave: 0,
            waveform: 0,
            volume: noise_vol,
            filter_cutoff: analysis.spectral_centroid.clamp(200.0, 8000.0),
            filter_resonance: 1.0,
            sequencer: None,
            sequencer_params: HashMap::new(),
            extra_params: HashMap::new(),
        });
    }

    if !analysis.is_pitched && !analysis.is_noisy {
        // Fallback: noise-based
        recipe.layers.push(LayerRecipe {
            role: LayerRole::Texture,
            node_type: "noise".into(),
            octave: 0,
            waveform: 0,
            volume: 0.3,
            filter_cutoff: analysis.spectral_centroid.clamp(100.0, 5000.0),
            filter_resonance: 2.0,
            sequencer: None,
            sequencer_params: HashMap::new(),
            extra_params: HashMap::new(),
        });
    }

    // ── Envelope ──
    if analysis.is_percussive {
        // Use very short settings for effects
        recipe.reverb_mix = 0.1;
        recipe.reverb_size = 0.3;
    } else {
        recipe.reverb_mix = 0.25;
        recipe.reverb_size = 0.6;
    }

    // ── Formant shaping ──
    // If formants detected, note them in description for manual tweaking
    if !analysis.formants.is_empty() {
        let formant_desc: Vec<String> = analysis
            .formants
            .iter()
            .map(|f| format!("{:.0}Hz(bw={:.0})", f.center_freq, f.bandwidth))
            .collect();
        recipe.description += &format!(" Formants: {}", formant_desc.join(", "));
    }

    // ── Modulation ──
    if analysis.vibrato_rate.is_some() {
        recipe.description += &format!(
            " Vibrato: {:.1}Hz depth={:.1}cents",
            analysis.vibrato_rate.unwrap_or(0.0),
            analysis.vibrato_depth.unwrap_or(0.0)
        );
    }

    recipe.master_gain = 0.5;
    recipe
}

/// Classify a sound description into a category for expert knowledge
pub fn classify_sound(description: &str) -> SoundCategory {
    let desc = description.to_lowercase();

    if contains_any(
        &desc,
        &["bird", "chirp", "tweet", "robin", "sparrow", "warbler"],
    ) {
        SoundCategory::Bird
    } else if contains_any(
        &desc,
        &[
            "rain", "water", "drip", "splash", "ocean", "wave", "stream", "river",
        ],
    ) {
        SoundCategory::Water
    } else if contains_any(&desc, &["wind", "breeze", "gust", "howl"]) {
        SoundCategory::Wind
    } else if contains_any(&desc, &["fire", "flame", "crackle", "campfire"]) {
        SoundCategory::Fire
    } else if contains_any(
        &desc,
        &[
            "drum", "kick", "snare", "hat", "cymbal", "percussion", "808",
        ],
    ) {
        SoundCategory::Drum
    } else if contains_any(
        &desc,
        &[
            "guitar", "bass", "string", "violin", "cello", "pluck", "strum",
        ],
    ) {
        SoundCategory::String
    } else if contains_any(&desc, &["piano", "keys", "rhodes", "organ"]) {
        SoundCategory::Keys
    } else if contains_any(
        &desc,
        &[
            "voice", "vocal", "sing", "speak", "choir", "aah", "ooh",
        ],
    ) {
        SoundCategory::Voice
    } else if contains_any(&desc, &["bell", "chime", "gong", "bowl", "metallic"]) {
        SoundCategory::Bell
    } else if contains_any(
        &desc,
        &[
            "laser",
            "zap",
            "sci-fi",
            "space",
            "robot",
            "transformer",
            "electric",
        ],
    ) {
        SoundCategory::SciFi
    } else if contains_any(&desc, &["step", "walk", "footstep", "foot"]) {
        SoundCategory::Footstep
    } else if contains_any(&desc, &["door", "creak", "knock", "slam", "engine", "motor", "machine", "servo"]) {
        SoundCategory::Mechanical
    } else if contains_any(&desc, &["thunder", "explosion", "boom", "crash"]) {
        SoundCategory::Explosion
    } else if contains_any(&desc, &["click", "beep", "notification", "alert", "ui"]) {
        SoundCategory::UISound
    } else {
        SoundCategory::Unknown
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SoundCategory {
    Bird,
    Water,
    Wind,
    Fire,
    Drum,
    String,
    Keys,
    Voice,
    Bell,
    SciFi,
    Footstep,
    Mechanical,
    Explosion,
    UISound,
    Unknown,
}

/// Get expert synthesis advice for a category
pub fn get_expert_recipe(category: SoundCategory, description: &str) -> PatchRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = description.to_string();

    match category {
        SoundCategory::Bird => {
            recipe.description = "Bird chirp: FM synthesis with rapid pitch sweep".into();
            recipe.tempo = 60.0;
            recipe.reverb_mix = 0.3;
            recipe.reverb_size = 0.6;
            // Sine osc with fast pitch envelope (simulated by setting high freq)
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Lead,
                node_type: "oscillator".into(),
                octave: 6, // high register
                waveform: 0, // sine
                volume: 0.4,
                filter_cutoff: 6000.0,
                filter_resonance: 3.0,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: {
                    let mut p = HashMap::new();
                    p.insert("frequency".into(), 2000.0);
                    p
                },
            });
        }
        SoundCategory::Water => {
            recipe.description = "Water: filtered noise with resonant drips".into();
            recipe.tempo = 60.0;
            recipe.reverb_mix = 0.45;
            recipe.reverb_size = 0.7;
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Texture,
                node_type: "noise".into(),
                octave: 0,
                waveform: 0,
                volume: 0.2,
                filter_cutoff: 2000.0,
                filter_resonance: 1.5,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: HashMap::new(),
            });
        }
        SoundCategory::Drum => {
            recipe.description = "Drum: dedicated drum synthesis".into();
            recipe.tempo = 120.0;
            let desc_lower = description.to_lowercase();
            let drum_type = if desc_lower.contains("kick") || desc_lower.contains("808") {
                "kick_drum"
            } else if desc_lower.contains("snare") {
                "snare_drum"
            } else if desc_lower.contains("hat") {
                "hi_hat"
            } else if desc_lower.contains("clap") {
                "clap"
            } else {
                "kick_drum"
            };
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Rhythm,
                node_type: drum_type.into(),
                octave: 0,
                waveform: 0,
                volume: 0.6,
                filter_cutoff: 20000.0,
                filter_resonance: 0.5,
                sequencer: Some("step_sequencer".into()),
                sequencer_params: {
                    let mut p = HashMap::new();
                    p.insert("steps".into(), 4.0);
                    p
                },
                extra_params: HashMap::new(),
            });
        }
        SoundCategory::UISound => {
            recipe.description = "UI sound: bright short tone".into();
            recipe.tempo = 120.0;
            recipe.reverb_mix = 0.15;
            recipe.reverb_size = 0.3;
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Lead,
                node_type: "oscillator".into(),
                octave: 5,
                waveform: 0, // sine
                volume: 0.3,
                filter_cutoff: 5000.0,
                filter_resonance: 0.5,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: {
                    let mut p = HashMap::new();
                    p.insert("frequency".into(), 880.0);
                    p
                },
            });
        }
        SoundCategory::SciFi => {
            recipe.description = "Sci-fi: ring mod + filter sweep".into();
            recipe.tempo = 90.0;
            recipe.reverb_mix = 0.4;
            recipe.reverb_size = 0.75;
            // Two oscillators for ring mod effect
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Lead,
                node_type: "oscillator".into(),
                octave: 3,
                waveform: 2, // square
                volume: 0.3,
                filter_cutoff: 3000.0,
                filter_resonance: 5.0,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: {
                    let mut p = HashMap::new();
                    p.insert("frequency".into(), 200.0);
                    p
                },
            });
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Texture,
                node_type: "noise".into(),
                octave: 0,
                waveform: 0,
                volume: 0.1,
                filter_cutoff: 5000.0,
                filter_resonance: 2.0,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: HashMap::new(),
            });
        }
        _ => {
            // Generic: oscillator + noise
            recipe.description = format!("Generic synthesis for: {description}");
            recipe.layers.push(LayerRecipe {
                role: LayerRole::Pad,
                node_type: "oscillator".into(),
                octave: 4,
                waveform: 1,
                volume: 0.3,
                filter_cutoff: 2000.0,
                filter_resonance: 1.5,
                sequencer: None,
                sequencer_params: HashMap::new(),
                extra_params: HashMap::new(),
            });
        }
    }

    recipe
}

fn contains_any(desc: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|k| desc.contains(k))
}

fn freq_to_octave(freq: f64) -> i32 {
    if freq <= 0.0 {
        return 4;
    }
    // MIDI note = 12 * log2(freq/440) + 69
    // Octave = note / 12 - 1
    let note = 12.0 * (freq / 440.0).log2() + 69.0;
    ((note / 12.0) as i32 - 1).clamp(1, 7)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chord_diagnostics::analysis::{Formant, Harmonic, SoundAnalysis};

    #[test]
    fn plan_pitched_clean_sine() {
        let analysis = SoundAnalysis {
            is_pitched: true,
            fundamental_freq: Some(440.0),
            inharmonicity: 0.01,
            spectral_centroid: 1000.0,
            harmonics: vec![Harmonic {
                frequency: 440.0,
                amplitude: 1.0,
                harmonic_number: 1,
            }],
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        assert!(!recipe.layers.is_empty(), "Should have at least one layer");
        assert_eq!(recipe.layers[0].node_type, "oscillator");
        assert_eq!(recipe.layers[0].waveform, 0); // sine (few harmonics)
    }

    #[test]
    fn plan_pitched_rich_harmonics() {
        let harmonics: Vec<Harmonic> = (1..=8)
            .map(|n| Harmonic {
                frequency: 220.0 * n as f64,
                amplitude: 1.0 / n as f64,
                harmonic_number: n,
            })
            .collect();
        let analysis = SoundAnalysis {
            is_pitched: true,
            fundamental_freq: Some(220.0),
            inharmonicity: 0.02,
            spectral_centroid: 2000.0,
            harmonics,
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        assert!(!recipe.layers.is_empty());
        assert_eq!(recipe.layers[0].waveform, 1); // saw (many harmonics)
    }

    #[test]
    fn plan_inharmonic_creates_multiple_oscs() {
        let analysis = SoundAnalysis {
            is_pitched: true,
            fundamental_freq: Some(500.0),
            inharmonicity: 0.1, // very inharmonic
            spectral_centroid: 3000.0,
            harmonics: vec![
                Harmonic {
                    frequency: 500.0,
                    amplitude: 1.0,
                    harmonic_number: 1,
                },
                Harmonic {
                    frequency: 1020.0,
                    amplitude: 0.7,
                    harmonic_number: 2,
                },
                Harmonic {
                    frequency: 1550.0,
                    amplitude: 0.4,
                    harmonic_number: 3,
                },
            ],
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        assert!(
            recipe.layers.len() >= 3,
            "Inharmonic sound should create multiple osc layers, got {}",
            recipe.layers.len()
        );
    }

    #[test]
    fn plan_noisy_adds_noise_layer() {
        let analysis = SoundAnalysis {
            is_pitched: true,
            fundamental_freq: Some(440.0),
            inharmonicity: 0.01,
            is_noisy: true,
            noise_ratio: 0.5,
            spectral_centroid: 2000.0,
            harmonics: vec![Harmonic {
                frequency: 440.0,
                amplitude: 1.0,
                harmonic_number: 1,
            }],
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        let has_noise = recipe.layers.iter().any(|l| l.node_type == "noise");
        assert!(has_noise, "Noisy sound should include a noise layer");
    }

    #[test]
    fn plan_unpitched_fallback() {
        let analysis = SoundAnalysis {
            is_pitched: false,
            is_noisy: false,
            spectral_centroid: 1000.0,
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        assert!(!recipe.layers.is_empty());
        assert_eq!(recipe.layers[0].node_type, "noise");
    }

    #[test]
    fn plan_percussive_short_reverb() {
        let analysis = SoundAnalysis {
            is_percussive: true,
            is_pitched: false,
            is_noisy: false,
            spectral_centroid: 1000.0,
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        assert!(
            recipe.reverb_mix <= 0.15,
            "Percussive should have low reverb mix"
        );
        assert!(
            recipe.reverb_size <= 0.4,
            "Percussive should have small reverb size"
        );
    }

    #[test]
    fn plan_formants_in_description() {
        let analysis = SoundAnalysis {
            is_pitched: true,
            fundamental_freq: Some(200.0),
            inharmonicity: 0.01,
            spectral_centroid: 1500.0,
            harmonics: vec![Harmonic {
                frequency: 200.0,
                amplitude: 1.0,
                harmonic_number: 1,
            }],
            formants: vec![Formant {
                center_freq: 700.0,
                bandwidth: 120.0,
                amplitude: 0.8,
            }],
            ..Default::default()
        };
        let recipe = plan_synthesis(&analysis);
        assert!(
            recipe.description.contains("Formants"),
            "Description should mention formants"
        );
    }

    #[test]
    fn classify_bird_sound() {
        assert_eq!(classify_sound("bird chirping"), SoundCategory::Bird);
        assert_eq!(classify_sound("robin singing"), SoundCategory::Bird);
    }

    #[test]
    fn classify_drum_sound() {
        assert_eq!(classify_sound("808 kick"), SoundCategory::Drum);
        assert_eq!(classify_sound("snare hit"), SoundCategory::Drum);
    }

    #[test]
    fn classify_water_sound() {
        assert_eq!(classify_sound("rain on window"), SoundCategory::Water);
        assert_eq!(classify_sound("ocean waves"), SoundCategory::Water);
    }

    #[test]
    fn classify_unknown() {
        assert_eq!(classify_sound("something weird"), SoundCategory::Unknown);
    }

    #[test]
    fn expert_bird_recipe() {
        let recipe = get_expert_recipe(SoundCategory::Bird, "bird chirping");
        assert!(!recipe.layers.is_empty());
        assert_eq!(recipe.layers[0].node_type, "oscillator");
        assert!(recipe.layers[0].octave >= 5, "Bird should be high register");
    }

    #[test]
    fn expert_drum_kick_recipe() {
        let recipe = get_expert_recipe(SoundCategory::Drum, "808 kick");
        assert!(!recipe.layers.is_empty());
        assert_eq!(recipe.layers[0].node_type, "kick_drum");
    }

    #[test]
    fn expert_drum_snare_recipe() {
        let recipe = get_expert_recipe(SoundCategory::Drum, "snare hit");
        assert!(!recipe.layers.is_empty());
        assert_eq!(recipe.layers[0].node_type, "snare_drum");
    }

    #[test]
    fn expert_water_recipe() {
        let recipe = get_expert_recipe(SoundCategory::Water, "rain drops");
        assert!(!recipe.layers.is_empty());
        assert_eq!(recipe.layers[0].node_type, "noise");
        assert!(recipe.reverb_mix > 0.3, "Water should have reverb");
    }

    #[test]
    fn expert_unknown_has_fallback() {
        let recipe = get_expert_recipe(SoundCategory::Unknown, "mystery sound");
        assert!(!recipe.layers.is_empty(), "Unknown should still get layers");
    }

    #[test]
    fn freq_to_octave_middle_c() {
        assert_eq!(freq_to_octave(261.63), 4);
    }

    #[test]
    fn freq_to_octave_a440() {
        assert_eq!(freq_to_octave(440.0), 4);
    }

    #[test]
    fn freq_to_octave_very_low() {
        assert_eq!(freq_to_octave(30.0), 1);
    }

    #[test]
    fn freq_to_octave_very_high() {
        assert_eq!(freq_to_octave(8000.0), 7);
    }

    #[test]
    fn freq_to_octave_zero_defaults() {
        assert_eq!(freq_to_octave(0.0), 4);
    }
}
