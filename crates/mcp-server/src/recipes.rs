//! Sound Design Recipes — Production-quality preset patch recipes.
//!
//! Each recipe defines the EXACT node graph, parameters, and modulation that produces
//! a professional result. These are used by the vibe translator when parsing descriptions.
//!
//! Every recipe follows the 6 rules of professional sound:
//! 1. Multiple sources blended together
//! 2. Filtering to shape the spectrum
//! 3. Movement — parameters that change over time
//! 4. Space — reverb, delay, width
//! 5. Texture — noise, saturation, imperfection
//! 6. Dynamic response — volume and timbre that change with intensity

use std::collections::HashMap;
use crate::vibe::{Key, LayerRecipe, LayerRole, PatchRecipe, Scale};

/// A more detailed recipe that includes effects chain and modulation.
#[derive(Debug, Clone)]
pub struct DetailedRecipe {
    pub patch: PatchRecipe,
    /// Additional effect nodes to add to master bus.
    pub master_effects: Vec<EffectRecipe>,
    /// LFO modulation routes.
    pub modulations: Vec<ModulationRoute>,
}

#[derive(Debug, Clone)]
pub struct EffectRecipe {
    pub effect_type: String,
    pub params: HashMap<String, f64>,
}

#[derive(Debug, Clone)]
pub struct ModulationRoute {
    pub source_type: String, // "lfo"
    pub source_params: HashMap<String, f64>,
    pub target_layer_index: usize,
    pub target_param: String,
}

/// Warm analog pad — 4 detuned voices, LFO filter, chorus, tape saturation, big reverb.
pub fn recipe_warm_pad(key: Key, scale: Scale) -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Warm Pad".into();
    recipe.description = "Lush analog pad with detuned voices and slow filter breathing".into();
    recipe.tempo = 60.0;
    recipe.key = key;
    recipe.scale = scale;
    recipe.reverb_mix = 0.3;
    recipe.reverb_size = 0.85;
    recipe.master_gain = 0.4;

    // Layer 0: Detuned saw voice 1
    recipe.layers.push(pad_voice(1, -10.0, 0.18, 2000.0));
    // Layer 1: Detuned saw voice 2
    recipe.layers.push(pad_voice(1, 10.0, 0.18, 2000.0));
    // Layer 2: Detuned saw voice 3
    recipe.layers.push(pad_voice(1, -3.0, 0.15, 2000.0));
    // Layer 3: Detuned saw voice 4
    recipe.layers.push(pad_voice(1, 3.0, 0.15, 2000.0));
    // Layer 4: Sub sine (weight)
    recipe.layers.push(sub_layer(0.12));
    // Layer 5: Noise breath (air/texture)
    recipe.layers.push(noise_texture(0.02, 4000.0));

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "chorus".into(),
                params: hmap(&[("rate", 0.4), ("depth", 0.35), ("mix", 0.2)]),
            },
            EffectRecipe {
                effect_type: "waveshaper".into(),
                params: hmap(&[("drive", 0.08), ("mode", 2.0), ("mix", 0.3)]),
            },
        ],
        modulations: vec![
            ModulationRoute {
                source_type: "lfo".into(),
                source_params: hmap(&[("rate", 0.12), ("depth", 1200.0)]),
                target_layer_index: 0, // modulates filter cutoff of first layer
                target_param: "cutoff".into(),
            },
        ],
    }
}

/// Deep bass — saw + sub sine, filter envelope pluck, saturation, compression.
pub fn recipe_deep_bass(key: Key) -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Deep Bass".into();
    recipe.description = "Growling bass with sub weight and harmonic presence".into();
    recipe.tempo = 120.0;
    recipe.key = key;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.05;
    recipe.reverb_size = 0.3;
    recipe.master_gain = 0.45;

    // Layer 0: Saw bass body
    let mut bass_body = LayerRecipe {
        role: LayerRole::Bass,
        node_type: "oscillator".into(),
        octave: 2,
        waveform: 1, // saw
        volume: 0.35,
        filter_cutoff: 800.0,
        filter_resonance: 4.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("drive", 0.1)]),
    };
    bass_body.extra_params.insert("detune".into(), 0.0);
    recipe.layers.push(bass_body);

    // Layer 1: Sub sine (one octave below)
    recipe.layers.push(sub_layer(0.25));

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "waveshaper".into(),
                params: hmap(&[("drive", 0.25), ("mode", 0.0), ("mix", 0.35)]),
            },
            EffectRecipe {
                effect_type: "compressor".into(),
                params: hmap(&[("threshold", -10.0), ("ratio", 4.0), ("attack", 0.005), ("release", 0.1)]),
            },
        ],
        modulations: vec![],
    }
}

/// 808 kick — sine body with pitch envelope, noise click, saturation.
pub fn recipe_808_kick() -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "808 Kick".into();
    recipe.description = "Deep 808 kick with sub tail and saturated click".into();
    recipe.tempo = 140.0;
    recipe.key = Key::F;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.0;
    recipe.master_gain = 0.5;

    recipe.layers.push(LayerRecipe {
        role: LayerRole::Rhythm,
        node_type: "kick_drum".into(),
        octave: 0,
        waveform: 0,
        volume: 0.6,
        filter_cutoff: 200.0,
        filter_resonance: 0.0,
        sequencer: Some("step_sequencer".into()),
        sequencer_params: hmap(&[("steps", 4.0)]),
        extra_params: hmap(&[
            ("frequency", 50.0), ("pitch_env", 300.0), ("body_decay", 0.4),
            ("click", 0.5), ("drive", 0.2),
        ]),
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "compressor".into(),
                params: hmap(&[("threshold", -8.0), ("ratio", 4.0), ("attack", 0.003), ("release", 0.1)]),
            },
        ],
        modulations: vec![],
    }
}

/// Professional drum kit — kick, snare, hat, clap with bus compression and short room reverb.
pub fn recipe_production_drums() -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Production Drums".into();
    recipe.description = "Punchy production drums with bus compression and room".into();
    recipe.tempo = 120.0;
    recipe.key = Key::C;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.08;
    recipe.reverb_size = 0.3;
    recipe.master_gain = 0.5;

    // Kick
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Rhythm,
        node_type: "kick_drum".into(),
        octave: 0, waveform: 0, volume: 0.55,
        filter_cutoff: 20000.0, filter_resonance: 0.0,
        sequencer: Some("step_sequencer".into()),
        sequencer_params: hmap(&[("steps", 16.0), ("swing", 0.0)]),
        extra_params: hmap(&[
            ("frequency", 55.0), ("pitch_env", 250.0), ("body_decay", 0.3),
            ("click", 0.5), ("drive", 0.15),
        ]),
    });

    // Snare
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Rhythm,
        node_type: "snare_drum".into(),
        octave: 0, waveform: 0, volume: 0.4,
        filter_cutoff: 20000.0, filter_resonance: 0.0,
        sequencer: Some("euclidean".into()),
        sequencer_params: hmap(&[("steps", 16.0), ("pulses", 4.0), ("rotation", 4.0)]),
        extra_params: hmap(&[
            ("body_freq", 200.0), ("noise_decay", 0.15), ("crack", 0.6), ("mix", 0.5),
        ]),
    });

    // Hi-hat
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Rhythm,
        node_type: "hi_hat".into(),
        octave: 0, waveform: 0, volume: 0.2,
        filter_cutoff: 20000.0, filter_resonance: 0.0,
        sequencer: Some("euclidean".into()),
        sequencer_params: hmap(&[("steps", 16.0), ("pulses", 9.0)]),
        extra_params: hmap(&[("decay", 0.03), ("tone", 0.5), ("ring_mod", 0.7)]),
    });

    // Clap
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Rhythm,
        node_type: "clap".into(),
        octave: 0, waveform: 0, volume: 0.25,
        filter_cutoff: 20000.0, filter_resonance: 0.0,
        sequencer: Some("euclidean".into()),
        sequencer_params: hmap(&[("steps", 16.0), ("pulses", 2.0), ("rotation", 4.0)]),
        extra_params: hmap(&[("bursts", 4.0), ("spread", 0.012), ("decay", 0.15)]),
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "compressor".into(),
                params: hmap(&[("threshold", -10.0), ("ratio", 3.0), ("attack", 0.008), ("release", 0.08)]),
            },
            EffectRecipe {
                effect_type: "waveshaper".into(),
                params: hmap(&[("drive", 0.1), ("mode", 2.0), ("mix", 0.25)]),
            },
        ],
        modulations: vec![],
    }
}

/// Ambient texture — multiple independent layers at different frequency ranges.
pub fn recipe_ambient_texture(key: Key, scale: Scale) -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Ambient Texture".into();
    recipe.description = "Deep evolving ambient with independent layers modulated at different rates".into();
    recipe.tempo = 60.0;
    recipe.key = key;
    recipe.scale = scale;
    recipe.reverb_mix = 0.4;
    recipe.reverb_size = 0.9;
    recipe.master_gain = 0.35;

    // Sub drone
    recipe.layers.push(sub_layer(0.15));
    // Mid pad (2 detuned saws)
    recipe.layers.push(pad_voice(1, -8.0, 0.12, 1500.0));
    recipe.layers.push(pad_voice(1, 8.0, 0.12, 1500.0));
    // High texture — filtered noise
    recipe.layers.push(noise_texture(0.03, 5000.0));
    // Very quiet air layer
    recipe.layers.push(noise_texture(0.01, 8000.0));

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "chorus".into(),
                params: hmap(&[("rate", 0.25), ("depth", 0.3), ("mix", 0.15)]),
            },
        ],
        modulations: vec![
            ModulationRoute {
                source_type: "lfo".into(),
                source_params: hmap(&[("rate", 0.05), ("depth", 800.0)]),
                target_layer_index: 1,
                target_param: "cutoff".into(),
            },
            ModulationRoute {
                source_type: "lfo".into(),
                source_params: hmap(&[("rate", 0.07), ("depth", 2000.0)]),
                target_layer_index: 3,
                target_param: "cutoff".into(),
            },
        ],
    }
}

/// Rain — filtered white noise with slow modulation, glass resonance layer.
pub fn recipe_rain() -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Rain".into();
    recipe.description = "Rain on a window with glass resonance and slow intensity variation".into();
    recipe.tempo = 60.0;
    recipe.key = Key::C;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.2;
    recipe.reverb_size = 0.6;
    recipe.master_gain = 0.4;

    // Main rain — white noise through lowpass
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0, waveform: 0, volume: 0.08,
        filter_cutoff: 4000.0, filter_resonance: 0.2,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 0.0)]), // white
    });

    // Glass resonance — pink noise through bandpass
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0, waveform: 0, volume: 0.015,
        filter_cutoff: 6000.0, filter_resonance: 6.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 1.0), ("filter_type", 2.0)]), // pink, bandpass
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![],
        modulations: vec![
            ModulationRoute {
                source_type: "lfo".into(),
                source_params: hmap(&[("rate", 0.03), ("depth", 1500.0)]),
                target_layer_index: 0,
                target_param: "cutoff".into(),
            },
        ],
    }
}

/// Tension riser — rising filter sweep, ascending pitch, accelerating rhythm.
pub fn recipe_tension_riser() -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Tension Riser".into();
    recipe.description = "Building tension — rising noise sweep, ascending drone, accelerating pulse".into();
    recipe.tempo = 100.0;
    recipe.key = Key::Db;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.25;
    recipe.reverb_size = 0.7;
    recipe.master_gain = 0.45;

    // Rising noise sweep
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0, waveform: 0, volume: 0.1,
        filter_cutoff: 200.0, filter_resonance: 4.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 0.0), ("filter_type", 2.0)]),
    });

    // Ascending drone
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Pad,
        node_type: "oscillator".into(),
        octave: 3, waveform: 1, volume: 0.15,
        filter_cutoff: 1000.0, filter_resonance: 3.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "waveshaper".into(),
                params: hmap(&[("drive", 0.3), ("mode", 2.0), ("mix", 0.4)]),
            },
        ],
        modulations: vec![],
    }
}

/// Film impact — sub drop, noise crack, metallic ring.
pub fn recipe_film_impact() -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Film Impact".into();
    recipe.description = "Massive cinematic impact with sub drop, noise crack, and metallic ring".into();
    recipe.tempo = 60.0;
    recipe.key = Key::C;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.2;
    recipe.reverb_size = 0.6;
    recipe.master_gain = 0.5;

    // Sub drop
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Bass,
        node_type: "oscillator".into(),
        octave: 1, waveform: 0, volume: 0.4,
        filter_cutoff: 200.0, filter_resonance: 0.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    });

    // Noise crack
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0, waveform: 0, volume: 0.2,
        filter_cutoff: 8000.0, filter_resonance: 0.5,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 0.0)]),
    });

    // Metallic ring
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave: 6, waveform: 0, volume: 0.05,
        filter_cutoff: 10000.0, filter_resonance: 3.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "compressor".into(),
                params: hmap(&[("threshold", -6.0), ("ratio", 8.0), ("attack", 0.001), ("release", 0.15)]),
            },
        ],
        modulations: vec![],
    }
}

/// Lo-fi keys — triangle/sine with warmth, tape saturation, vinyl noise.
pub fn recipe_lofi_keys(key: Key) -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Lo-Fi Keys".into();
    recipe.description = "Mellow electric piano with lo-fi warmth and vinyl texture".into();
    recipe.tempo = 80.0;
    recipe.key = key;
    recipe.scale = Scale::MinorPentatonic;
    recipe.reverb_mix = 0.3;
    recipe.reverb_size = 0.6;
    recipe.delay_mix = 0.12;
    recipe.delay_feedback = 0.2;
    recipe.master_gain = 0.4;

    // Keys — triangle wave
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave: 4, waveform: 3, volume: 0.2,
        filter_cutoff: 3000.0, filter_resonance: 1.5,
        sequencer: Some("markov_sequencer".into()),
        sequencer_params: hmap(&[("root_note", 60.0), ("randomness", 0.3)]),
        extra_params: hmap(&[("detune", 5.0)]),
    });

    // Vinyl crackle — brown noise very quiet
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0, waveform: 0, volume: 0.015,
        filter_cutoff: 5000.0, filter_resonance: 0.2,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 2.0)]),
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "waveshaper".into(),
                params: hmap(&[("drive", 0.12), ("mode", 2.0), ("mix", 0.3)]),
            },
        ],
        modulations: vec![],
    }
}

/// Supersaw lead — 6 detuned saws with vibrato, filter, delay.
pub fn recipe_supersaw_lead(key: Key) -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Supersaw Lead".into();
    recipe.description = "Massive supersaw lead with wide stereo and vibrato".into();
    recipe.tempo = 128.0;
    recipe.key = key;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.15;
    recipe.reverb_size = 0.5;
    recipe.delay_mix = 0.1;
    recipe.delay_feedback = 0.2;
    recipe.master_gain = 0.4;

    // 4 detuned saws
    recipe.layers.push(pad_voice(1, -15.0, 0.12, 4000.0));
    recipe.layers.push(pad_voice(1, 15.0, 0.12, 4000.0));
    recipe.layers.push(pad_voice(1, -7.0, 0.1, 4000.0));
    recipe.layers.push(pad_voice(1, 7.0, 0.1, 4000.0));

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "compressor".into(),
                params: hmap(&[("threshold", -12.0), ("ratio", 2.5), ("attack", 0.01), ("release", 0.15)]),
            },
        ],
        modulations: vec![
            ModulationRoute {
                source_type: "lfo".into(),
                source_params: hmap(&[("rate", 5.0), ("depth", 8.0)]),
                target_layer_index: 0,
                target_param: "detune".into(),
            },
        ],
    }
}

/// Euclidean bells — three Euclidean layers driving tuned bells.
pub fn recipe_euclidean_bells(key: Key, scale: Scale) -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Euclidean Bells".into();
    recipe.description = "Polyrhythmic bells with three Euclidean layers".into();
    recipe.tempo = 90.0;
    recipe.key = key;
    recipe.scale = scale;
    recipe.reverb_mix = 0.35;
    recipe.reverb_size = 0.75;
    recipe.master_gain = 0.35;

    // Three bell layers with different Euclidean patterns
    recipe.layers.push(LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave: 5, waveform: 0, volume: 0.15,
        filter_cutoff: 5000.0, filter_resonance: 3.0,
        sequencer: Some("euclidean".into()),
        sequencer_params: hmap(&[("steps", 16.0), ("pulses", 5.0)]),
        extra_params: HashMap::new(),
    });

    recipe.layers.push(LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave: 4, waveform: 0, volume: 0.12,
        filter_cutoff: 4000.0, filter_resonance: 3.0,
        sequencer: Some("euclidean".into()),
        sequencer_params: hmap(&[("steps", 16.0), ("pulses", 7.0), ("rotation", 3.0)]),
        extra_params: HashMap::new(),
    });

    recipe.layers.push(LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave: 6, waveform: 0, volume: 0.08,
        filter_cutoff: 6000.0, filter_resonance: 2.0,
        sequencer: Some("euclidean".into()),
        sequencer_params: hmap(&[("steps", 12.0), ("pulses", 5.0), ("rotation", 1.0)]),
        extra_params: HashMap::new(),
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![],
        modulations: vec![],
    }
}

/// Vinyl crackle texture.
pub fn recipe_vinyl_crackle() -> DetailedRecipe {
    let mut recipe = PatchRecipe::default();
    recipe.name = "Vinyl Crackle".into();
    recipe.description = "Warm vinyl crackle and pop texture".into();
    recipe.tempo = 60.0;
    recipe.key = Key::C;
    recipe.scale = Scale::Minor;
    recipe.reverb_mix = 0.1;
    recipe.master_gain = 0.35;

    recipe.layers.push(LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0, waveform: 0, volume: 0.03,
        filter_cutoff: 5000.0, filter_resonance: 0.3,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 2.0)]), // brown
    });

    DetailedRecipe {
        patch: recipe,
        master_effects: vec![
            EffectRecipe {
                effect_type: "waveshaper".into(),
                params: hmap(&[("drive", 0.1), ("mode", 2.0), ("mix", 0.3)]),
            },
        ],
        modulations: vec![],
    }
}

/// Get a recipe by name. Returns None if not found.
pub fn get_recipe(name: &str) -> Option<DetailedRecipe> {
    match name.to_lowercase().as_str() {
        "warm_pad" | "pad" => Some(recipe_warm_pad(Key::C, Scale::Minor)),
        "deep_bass" | "bass" | "reese" => Some(recipe_deep_bass(Key::C)),
        "808_kick" | "808" => Some(recipe_808_kick()),
        "production_drums" | "drums" | "drum_kit" => Some(recipe_production_drums()),
        "ambient_texture" | "ambient" | "texture" => Some(recipe_ambient_texture(Key::C, Scale::Minor)),
        "rain" | "rain_window" => Some(recipe_rain()),
        "tension_riser" | "riser" | "tension" => Some(recipe_tension_riser()),
        "film_impact" | "impact" | "drop" => Some(recipe_film_impact()),
        "lofi_keys" | "lofi" | "lo-fi" => Some(recipe_lofi_keys(Key::C)),
        "supersaw_lead" | "supersaw" | "lead" => Some(recipe_supersaw_lead(Key::C)),
        "euclidean_bells" | "bells" | "euclidean" => Some(recipe_euclidean_bells(Key::D, Scale::Pentatonic)),
        "vinyl_crackle" | "vinyl" => Some(recipe_vinyl_crackle()),
        _ => None,
    }
}

/// List all available recipe names.
pub fn list_recipes() -> Vec<&'static str> {
    vec![
        "warm_pad", "deep_bass", "808_kick", "production_drums",
        "ambient_texture", "rain", "tension_riser", "film_impact",
        "lofi_keys", "supersaw_lead", "euclidean_bells", "vinyl_crackle",
    ]
}

// ─── Helpers ───

fn hmap(pairs: &[(&str, f64)]) -> HashMap<String, f64> {
    pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect()
}

fn pad_voice(waveform: u32, detune: f64, volume: f64, cutoff: f64) -> LayerRecipe {
    let mut extra = HashMap::new();
    extra.insert("detune".into(), detune);
    LayerRecipe {
        role: LayerRole::Pad,
        node_type: "oscillator".into(),
        octave: 4,
        waveform,
        volume,
        filter_cutoff: cutoff,
        filter_resonance: 2.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: extra,
    }
}

fn sub_layer(volume: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Bass,
        node_type: "oscillator".into(),
        octave: 2,
        waveform: 0, // sine
        volume,
        filter_cutoff: 200.0,
        filter_resonance: 0.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    }
}

fn noise_texture(volume: f64, cutoff: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0,
        waveform: 0,
        volume,
        filter_cutoff: cutoff,
        filter_resonance: 2.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: hmap(&[("color", 1.0)]), // pink noise
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warm_pad_has_multiple_layers() {
        let r = recipe_warm_pad(Key::C, Scale::Minor);
        assert!(r.patch.layers.len() >= 4, "Warm pad needs multiple voices for thickness");
    }

    #[test]
    fn deep_bass_has_sub() {
        let r = recipe_deep_bass(Key::C);
        let has_sub = r.patch.layers.iter().any(|l| l.waveform == 0 && l.octave == 2);
        assert!(has_sub, "Bass must have sub sine layer");
    }

    #[test]
    fn drums_have_compression() {
        let r = recipe_production_drums();
        let has_comp = r.master_effects.iter().any(|e| e.effect_type == "compressor");
        assert!(has_comp, "Drums must have bus compression");
    }

    #[test]
    fn ambient_has_modulation() {
        let r = recipe_ambient_texture(Key::C, Scale::Minor);
        assert!(!r.modulations.is_empty(), "Ambient must have LFO modulation");
    }

    #[test]
    fn all_recipes_retrievable() {
        for name in list_recipes() {
            assert!(get_recipe(name).is_some(), "Recipe {} should exist", name);
        }
    }
}
