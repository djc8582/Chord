//! Vibe-to-Sound translation engine.
//!
//! Translates natural language descriptions ("chill lo-fi beats", "dark ambient drone")
//! into concrete patch recipes — deterministic keyword-matching, no AI required.
//!
//! The recipe describes layers (bass, pad, lead, rhythm, texture), effects chain
//! parameters, tempo, key, and scale. The MCP server's `build_patch_from_recipe`
//! method turns recipes into actual graph nodes and connections.

use std::collections::HashMap;

/// Musical key.
#[derive(Debug, Clone, Copy)]
pub enum Key {
    C,
    Db,
    D,
    Eb,
    E,
    F,
    Gb,
    G,
    Ab,
    A,
    Bb,
    B,
}

/// Scale type.
#[derive(Debug, Clone, Copy)]
pub enum Scale {
    Major,
    Minor,
    Dorian,
    Pentatonic,
    MinorPentatonic,
    Blues,
    WholeTone,
    Chromatic,
}

/// What role a layer plays in the patch.
#[derive(Debug, Clone, Copy)]
pub enum LayerRole {
    Bass,
    Pad,
    Lead,
    Rhythm,
    Texture,
}

/// Source synthesis type.
#[derive(Debug, Clone, Copy)]
pub enum SourceType {
    Sine,
    Saw,
    Square,
    Triangle,
    Noise,
    Granular,
}

/// A recipe for one layer in a patch.
#[derive(Debug, Clone)]
pub struct LayerRecipe {
    pub role: LayerRole,
    /// e.g. "oscillator", "noise", "kick_drum"
    pub node_type: String,
    /// 2=bass, 4=mid, 6=high
    pub octave: i32,
    /// 0=sine, 1=saw, 2=square, 3=triangle
    pub waveform: u32,
    /// 0.0–1.0
    pub volume: f64,
    /// Hz
    pub filter_cutoff: f64,
    pub filter_resonance: f64,
    /// "step_sequencer", "euclidean", "markov_sequencer", etc.
    pub sequencer: Option<String>,
    pub sequencer_params: HashMap<String, f64>,
    pub extra_params: HashMap<String, f64>,
}

/// A complete patch recipe.
#[derive(Debug, Clone)]
pub struct PatchRecipe {
    pub name: String,
    pub description: String,
    pub tempo: f64,
    pub key: Key,
    pub scale: Scale,
    pub layers: Vec<LayerRecipe>,
    pub reverb_mix: f64,
    pub reverb_size: f64,
    pub delay_time: f64,
    pub delay_feedback: f64,
    pub delay_mix: f64,
    pub master_gain: f64,
}

impl Default for PatchRecipe {
    fn default() -> Self {
        Self {
            name: "Untitled".into(),
            description: String::new(),
            tempo: 120.0,
            key: Key::C,
            scale: Scale::MinorPentatonic,
            layers: Vec::new(),
            reverb_mix: 0.2,
            reverb_size: 0.5,
            delay_time: 0.375,
            delay_feedback: 0.25,
            delay_mix: 0.15,
            master_gain: 0.5,
        }
    }
}

/// Convert a key to its base frequency (octave 4).
pub fn key_to_freq(key: Key) -> f64 {
    match key {
        Key::C => 261.63,
        Key::Db => 277.18,
        Key::D => 293.66,
        Key::Eb => 311.13,
        Key::E => 329.63,
        Key::F => 349.23,
        Key::Gb => 369.99,
        Key::G => 392.00,
        Key::Ab => 415.30,
        Key::A => 440.00,
        Key::Bb => 466.16,
        Key::B => 493.88,
    }
}

/// Convert a key to a MIDI note number (octave 4).
pub fn key_to_midi(key: Key) -> f64 {
    match key {
        Key::C => 60.0,
        Key::Db => 61.0,
        Key::D => 62.0,
        Key::Eb => 63.0,
        Key::E => 64.0,
        Key::F => 65.0,
        Key::Gb => 66.0,
        Key::G => 67.0,
        Key::Ab => 68.0,
        Key::A => 69.0,
        Key::Bb => 70.0,
        Key::B => 71.0,
    }
}

/// Translate a natural language description into a PatchRecipe.
pub fn translate(description: &str) -> PatchRecipe {
    let desc = description.to_lowercase();
    let mut recipe = PatchRecipe::default();
    recipe.description = description.to_string();

    // ── MOOD → Key/Scale/Tempo ──
    if contains_any(&desc, &["happy", "bright", "upbeat", "cheerful", "joyful"]) {
        recipe.key = Key::C;
        recipe.scale = Scale::Major;
        recipe.tempo = 120.0;
    } else if contains_any(&desc, &["sad", "melancholy", "somber", "moody"]) {
        recipe.key = Key::C;
        recipe.scale = Scale::Minor;
        recipe.tempo = 85.0;
    } else if contains_any(&desc, &["chill", "relaxed", "calm", "peaceful", "gentle"]) {
        recipe.key = Key::D;
        recipe.scale = Scale::Major;
        recipe.tempo = 75.0;
        recipe.reverb_mix = 0.35;
        recipe.reverb_size = 0.7;
    } else if contains_any(&desc, &["tense", "anxious", "scary", "horror"]) {
        recipe.key = Key::Eb;
        recipe.scale = Scale::Minor;
        recipe.tempo = 90.0;
        recipe.reverb_mix = 0.4;
        recipe.reverb_size = 0.8;
    } else if contains_any(&desc, &["dreamy", "ethereal", "floating"]) {
        recipe.key = Key::G;
        recipe.scale = Scale::Pentatonic;
        recipe.tempo = 65.0;
        recipe.reverb_mix = 0.5;
        recipe.reverb_size = 0.9;
    } else if contains_any(&desc, &["epic", "cinematic", "grand", "powerful"]) {
        recipe.key = Key::D;
        recipe.scale = Scale::Minor;
        recipe.tempo = 100.0;
        recipe.reverb_mix = 0.4;
        recipe.reverb_size = 0.85;
    }

    // ── GENRE → Layers ──
    if contains_any(&desc, &["lo-fi", "lofi", "lo fi"]) {
        recipe.name = "Lo-Fi Beats".into();
        recipe.tempo = 85.0;
        recipe.layers.push(drum_layer("kick_drum", 0.6));
        recipe.layers.push(drum_layer("snare_drum", 0.35));
        recipe.layers.push(drum_layer("hi_hat", 0.2));
        recipe.layers.push(bass_layer(1, 0.4, 400.0));
        recipe.layers.push(pad_layer(4, 0.15, 1500.0));
    } else if contains_any(&desc, &["ambient", "drone", "atmospheric"]) {
        recipe.name = "Ambient".into();
        recipe.tempo = 60.0;
        recipe.reverb_mix = 0.55;
        recipe.reverb_size = 0.9;
        recipe.layers.push(bass_layer(0, 0.25, 200.0));
        recipe.layers.push(pad_layer(4, 0.2, 2000.0));
        recipe.layers.push(texture_layer(0.08));
    } else if contains_any(&desc, &["jazz", "jazzy"]) {
        recipe.name = "Jazz".into();
        recipe.tempo = 110.0;
        recipe.scale = Scale::Dorian;
        recipe.layers.push(drum_layer("kick_drum", 0.4));
        recipe.layers.push(drum_layer("snare_drum", 0.25));
        recipe.layers.push(drum_layer("hi_hat", 0.15));
        recipe.layers.push(bass_layer(1, 0.4, 500.0));
        recipe.layers.push(pad_layer(4, 0.2, 3000.0));
    } else if contains_any(&desc, &["electronic", "edm", "dance", "techno"]) {
        recipe.name = "Electronic".into();
        recipe.tempo = 128.0;
        recipe.layers.push(drum_layer("kick_drum", 0.7));
        recipe.layers.push(drum_layer("hi_hat", 0.25));
        recipe.layers.push(drum_layer("clap", 0.3));
        recipe.layers.push(bass_layer(1, 0.5, 300.0));
        recipe.layers.push(lead_layer(4, 0.2, 4000.0));
    } else if contains_any(&desc, &["synthwave", "retro", "80s"]) {
        recipe.name = "Synthwave".into();
        recipe.tempo = 108.0;
        recipe.layers.push(drum_layer("kick_drum", 0.6));
        recipe.layers.push(drum_layer("snare_drum", 0.3));
        recipe.layers.push(drum_layer("hi_hat", 0.2));
        recipe.layers.push(bass_layer(1, 0.45, 350.0));
        recipe.layers.push(pad_layer(4, 0.25, 2500.0));
        recipe.layers.push(lead_layer(5, 0.15, 5000.0));
        recipe.delay_mix = 0.25;
        recipe.delay_feedback = 0.35;
    } else if contains_any(&desc, &["meditation", "zen", "mindful", "breathing"]) {
        recipe.name = "Meditation".into();
        recipe.tempo = 50.0;
        recipe.reverb_mix = 0.6;
        recipe.reverb_size = 0.95;
        recipe.layers.push(bass_layer(0, 0.2, 150.0));
        recipe.layers.push(pad_layer(5, 0.1, 3000.0));
        recipe.layers.push(texture_layer(0.05));
    } else if contains_any(&desc, &["generative", "evolving", "experimental"]) {
        recipe.name = "Generative".into();
        recipe.tempo = 90.0;
        recipe.layers.push(sequenced_layer("markov_sequencer", 1, 0.3, 2000.0));
        recipe
            .layers
            .push(sequenced_layer("gravity_sequencer", 3, 0.2, 3000.0));
        recipe.layers.push(sequenced_layer("euclidean", 5, 0.1, 4000.0));
        recipe.layers.push(texture_layer(0.06));
        recipe.reverb_mix = 0.35;
    } else if contains_any(&desc, &["beat", "beats", "drum", "drums", "rhythm"]) {
        recipe.name = "Beat".into();
        recipe.tempo = 120.0;
        recipe.layers.push(drum_layer("kick_drum", 0.65));
        recipe.layers.push(drum_layer("snare_drum", 0.35));
        recipe.layers.push(drum_layer("hi_hat", 0.2));
        recipe.layers.push(drum_layer("tom", 0.2));
    } else if contains_any(&desc, &["rain", "storm", "weather"]) {
        recipe.name = "Rain".into();
        recipe.tempo = 60.0;
        recipe.reverb_mix = 0.5;
        recipe.layers.push(texture_layer(0.15));
        recipe.layers.push(bass_layer(0, 0.1, 100.0));
    } else if contains_any(&desc, &["space", "cosmic", "stellar"]) {
        recipe.name = "Space".into();
        recipe.tempo = 55.0;
        recipe.reverb_mix = 0.65;
        recipe.reverb_size = 0.95;
        recipe.layers.push(bass_layer(0, 0.15, 100.0));
        recipe.layers.push(pad_layer(5, 0.12, 6000.0));
        recipe.layers.push(texture_layer(0.04));
    } else {
        // Default: gentle ambient
        recipe.name = "Patch".into();
        recipe.layers.push(bass_layer(0, 0.2, 200.0));
        recipe.layers.push(pad_layer(4, 0.15, 2000.0));
    }

    // ── TEXTURE modifiers ──
    if contains_any(&desc, &["warm", "cozy"]) {
        for layer in &mut recipe.layers {
            layer.filter_cutoff = (layer.filter_cutoff * 0.6).max(200.0);
        }
    }
    if contains_any(&desc, &["bright", "crisp", "sparkle"]) {
        for layer in &mut recipe.layers {
            layer.filter_cutoff = (layer.filter_cutoff * 1.5).min(12000.0);
        }
    }

    // ── INTENSITY modifiers ──
    if contains_any(&desc, &["subtle", "gentle", "soft", "quiet"]) {
        recipe.master_gain = 0.3;
        for layer in &mut recipe.layers {
            layer.volume *= 0.6;
        }
    }
    if contains_any(&desc, &["loud", "intense", "heavy"]) {
        recipe.master_gain = 0.7;
        for layer in &mut recipe.layers {
            layer.volume *= 1.3;
        }
    }

    recipe
}

/// Check if description contains any of the keywords.
fn contains_any(desc: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|k| desc.contains(k))
}

/// Create a drum layer recipe.
fn drum_layer(drum_type: &str, volume: f64) -> LayerRecipe {
    let mut params = HashMap::new();
    match drum_type {
        "kick_drum" => {
            params.insert("steps".into(), 4.0);
        }
        "snare_drum" => {
            params.insert("steps".into(), 8.0);
            params.insert("pulses".into(), 3.0);
            params.insert("rotation".into(), 2.0);
        }
        "hi_hat" => {
            params.insert("steps".into(), 16.0);
            params.insert("pulses".into(), 9.0);
        }
        "clap" => {
            params.insert("steps".into(), 16.0);
            params.insert("pulses".into(), 2.0);
            params.insert("rotation".into(), 4.0);
        }
        "tom" => {
            params.insert("pattern_a".into(), 5.0);
            params.insert("pattern_b".into(), 7.0);
        }
        _ => {}
    }
    LayerRecipe {
        role: LayerRole::Rhythm,
        node_type: drum_type.to_string(),
        octave: 0,
        waveform: 0,
        volume,
        filter_cutoff: 20000.0,
        filter_resonance: 0.5,
        sequencer: Some(
            if drum_type == "kick_drum" {
                "step_sequencer"
            } else if drum_type == "tom" {
                "polyrhythm"
            } else {
                "euclidean"
            }
            .into(),
        ),
        sequencer_params: params,
        extra_params: HashMap::new(),
    }
}

fn bass_layer(waveform: u32, volume: f64, cutoff: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Bass,
        node_type: "oscillator".into(),
        octave: 2,
        waveform,
        volume,
        filter_cutoff: cutoff,
        filter_resonance: 2.0,
        sequencer: Some("markov_sequencer".into()),
        sequencer_params: {
            let mut p = HashMap::new();
            p.insert("root_note".into(), 36.0); // C2
            p.insert("scale_type".into(), 1.0);
            p.insert("randomness".into(), 0.2);
            p
        },
        extra_params: HashMap::new(),
    }
}

fn pad_layer(octave: i32, volume: f64, cutoff: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Pad,
        node_type: "oscillator".into(),
        octave,
        waveform: 1, // saw
        volume,
        filter_cutoff: cutoff,
        filter_resonance: 1.5,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    }
}

fn lead_layer(octave: i32, volume: f64, cutoff: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave,
        waveform: 1,
        volume,
        filter_cutoff: cutoff,
        filter_resonance: 2.0,
        sequencer: Some("gravity_sequencer".into()),
        sequencer_params: {
            let mut p = HashMap::new();
            p.insert("gravity".into(), 1.5);
            p.insert("num_particles".into(), 4.0);
            p.insert("scale".into(), 2.0);
            p
        },
        extra_params: HashMap::new(),
    }
}

fn sequenced_layer(seq_type: &str, octave: i32, volume: f64, cutoff: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Lead,
        node_type: "oscillator".into(),
        octave,
        waveform: 1,
        volume,
        filter_cutoff: cutoff,
        filter_resonance: 2.0,
        sequencer: Some(seq_type.into()),
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    }
}

fn texture_layer(volume: f64) -> LayerRecipe {
    LayerRecipe {
        role: LayerRole::Texture,
        node_type: "noise".into(),
        octave: 0,
        waveform: 0,
        volume,
        filter_cutoff: 3000.0,
        filter_resonance: 1.0,
        sequencer: None,
        sequencer_params: HashMap::new(),
        extra_params: HashMap::new(),
    }
}

/// Translate a modification request into parameter changes.
///
/// Returns `(target_hint, param_name, value)` triples where `target_hint`
/// is a category like "filter", "reverb", "master", "clock", or "bass".
pub fn translate_modification(description: &str) -> Vec<(String, String, f64)> {
    let desc = description.to_lowercase();
    let mut changes = Vec::new();

    if contains_any(&desc, &["darker", "warmer", "muffle"]) {
        changes.push(("filter".into(), "cutoff".into(), 600.0));
    }
    if contains_any(&desc, &["brighter", "open", "crisp"]) {
        changes.push(("filter".into(), "cutoff".into(), 5000.0));
    }
    if contains_any(&desc, &["more reverb", "wetter", "more space", "spacious"]) {
        changes.push(("reverb".into(), "mix".into(), 0.6));
        changes.push(("reverb".into(), "room_size".into(), 0.8));
    }
    if contains_any(&desc, &["less reverb", "drier", "dry"]) {
        changes.push(("reverb".into(), "mix".into(), 0.1));
    }
    if contains_any(&desc, &["louder"]) {
        changes.push(("master".into(), "gain".into(), 0.7));
    }
    if contains_any(&desc, &["quieter", "softer"]) {
        changes.push(("master".into(), "gain".into(), 0.25));
    }
    if contains_any(&desc, &["faster", "speed up"]) {
        changes.push(("clock".into(), "rate".into(), 6.0));
    }
    if contains_any(&desc, &["slower", "slow down"]) {
        changes.push(("clock".into(), "rate".into(), 2.0));
    }
    if contains_any(&desc, &["more bass"]) {
        changes.push(("bass".into(), "gain".into(), 0.6));
    }
    if contains_any(&desc, &["less bass"]) {
        changes.push(("bass".into(), "gain".into(), 0.15));
    }

    changes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translate_lofi_creates_layers() {
        let recipe = translate("chill lo-fi beats");
        assert_eq!(recipe.name, "Lo-Fi Beats");
        assert_eq!(recipe.tempo, 85.0);
        assert!(!recipe.layers.is_empty());
        // Should have drums + bass + pad
        assert!(recipe.layers.len() >= 4);
    }

    #[test]
    fn translate_ambient_creates_layers() {
        let recipe = translate("dark ambient drone");
        assert_eq!(recipe.name, "Ambient");
        assert_eq!(recipe.tempo, 60.0);
        assert!(recipe.reverb_mix > 0.4);
    }

    #[test]
    fn translate_default_fallback() {
        let recipe = translate("something completely unknown");
        assert_eq!(recipe.name, "Patch");
        assert_eq!(recipe.layers.len(), 2);
    }

    #[test]
    fn translate_warm_modifier_lowers_cutoff() {
        let recipe = translate("warm ambient drone");
        for layer in &recipe.layers {
            // Warm should lower cutoffs
            assert!(layer.filter_cutoff <= 3000.0);
        }
    }

    #[test]
    fn translate_modification_darker() {
        let changes = translate_modification("make it darker");
        assert!(!changes.is_empty());
        assert!(changes.iter().any(|(t, p, _)| t == "filter" && p == "cutoff"));
    }

    #[test]
    fn translate_modification_more_reverb() {
        let changes = translate_modification("more reverb please");
        assert!(changes.iter().any(|(t, p, _)| t == "reverb" && p == "mix"));
    }

    #[test]
    fn translate_modification_empty_for_unknown() {
        let changes = translate_modification("do something weird");
        assert!(changes.is_empty());
    }

    #[test]
    fn key_to_freq_middle_c() {
        let freq = key_to_freq(Key::C);
        assert!((freq - 261.63).abs() < 0.01);
    }

    #[test]
    fn key_to_freq_a440() {
        let freq = key_to_freq(Key::A);
        assert!((freq - 440.0).abs() < 0.01);
    }

    #[test]
    fn translate_electronic_has_kick() {
        let recipe = translate("electronic dance music");
        let has_kick = recipe
            .layers
            .iter()
            .any(|l| l.node_type == "kick_drum");
        assert!(has_kick, "Electronic should have a kick drum");
    }

    #[test]
    fn translate_meditation_slow_tempo() {
        let recipe = translate("meditation zen");
        assert!(recipe.tempo <= 55.0);
        assert!(recipe.reverb_mix >= 0.5);
    }

    #[test]
    fn translate_generative_has_sequencers() {
        let recipe = translate("generative evolving");
        let has_seq = recipe.layers.iter().any(|l| l.sequencer.is_some());
        assert!(has_seq, "Generative should have sequencer layers");
    }

    #[test]
    fn translate_intensity_loud() {
        let recipe = translate("loud intense beats");
        assert!(recipe.master_gain > 0.5);
    }

    #[test]
    fn translate_intensity_soft() {
        let recipe = translate("soft gentle ambient");
        assert!(recipe.master_gain < 0.4);
    }
}
