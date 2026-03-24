/**
 * Patch Builder — converts a PatchRecipe into a live Chord node graph.
 *
 * Takes the recipe from VibeTranslator and:
 * 1. Creates the master effects chain (reverb → compressor → limiter → output)
 * 2. Builds each instrument layer with proper signal chains
 * 3. Sets up LFO modulation where specified
 * 4. Creates and configures generative sequencers
 */

import type { Chord } from '../Chord.js';
import type { PatchRecipe, LayerRecipe } from './types.js';
import { RhythmEngine, type DrumTrack } from '../rhythm-engine.js';
import { HarmonicSequencer, type ChordSymbol } from '../harmonic-sequencer.js';
import { WalkingBassGenerator } from '../walking-bass.js';
import { SoloGenerator } from '../solo-generator.js';

export interface BuiltPatch {
  masterRevId: string;
  masterCompId: string;
  masterLimiterId: string;
  masterOutId: string;
  masterFilterId: string;
  layerGainIds: Map<string, string>; // layer name → gain node ID
  /** Bass oscillator IDs (for walking bass to set frequencies) */
  bassOscIds: string[];
  bassFilterId: string | null;
  /** Drum node IDs */
  drumIds: { kick: string; snare: string; hat: string } | null;
  /** Sequencers */
  rhythm: RhythmEngine | null;
  harmony: HarmonicSequencer | null;
  bass: WalkingBassGenerator | null;
  solo: SoloGenerator | null;
}

export class PatchBuilder {
  static build(engine: Chord, recipe: PatchRecipe): BuiltPatch {
    // ─── Master effects chain ───
    const masterRevId = engine.addNode('reverb');
    const masterCompId = engine.addNode('compressor');
    const masterFilterId = engine.addNode('filter');
    const masterLimiterId = engine.addNode('limiter');
    const masterOutId = engine.addNode('output');

    engine.setParameter(masterRevId, 'room_size', recipe.effects.reverb.room_size);
    engine.setParameter(masterRevId, 'damping', recipe.effects.reverb.damping);
    engine.setParameter(masterRevId, 'mix', recipe.effects.reverb.mix);
    engine.setParameter(masterCompId, 'threshold', recipe.effects.compressor.threshold);
    engine.setParameter(masterCompId, 'ratio', recipe.effects.compressor.ratio);
    engine.setParameter(masterCompId, 'attack', recipe.effects.compressor.attack);
    engine.setParameter(masterCompId, 'release', recipe.effects.compressor.release);
    engine.setParameter(masterFilterId, 'cutoff', 18000);
    engine.setParameter(masterLimiterId, 'ceiling', -1);

    engine.connect(masterRevId, 'out', masterCompId, 'in');
    engine.connect(masterCompId, 'out', masterFilterId, 'in');
    engine.connect(masterFilterId, 'out', masterLimiterId, 'in');
    engine.connect(masterLimiterId, 'out', masterOutId, 'in');

    const result: BuiltPatch = {
      masterRevId, masterCompId, masterLimiterId, masterOutId, masterFilterId,
      layerGainIds: new Map(),
      bassOscIds: [],
      bassFilterId: null,
      drumIds: null,
      rhythm: null,
      harmony: null,
      bass: null,
      solo: null,
    };

    // ─── Build each layer ───
    for (const layer of recipe.layers) {
      const layerOutput = this.buildLayer(engine, layer, result);
      // Connect layer output to master reverb
      if (layerOutput) {
        engine.connect(layerOutput, 'out', masterRevId, 'in');
      }
    }

    // ─── Set up generative sequencers ───
    this.buildSequencers(engine, recipe, result);

    return result;
  }

  private static buildLayer(engine: Chord, layer: LayerRecipe, result: BuiltPatch): string | null {
    if (layer.nodes.length === 0) return null;

    const ids: string[] = [];

    // Create all nodes
    for (const nodeDef of layer.nodes) {
      const id = engine.addNode(nodeDef.type);
      for (const [param, value] of Object.entries(nodeDef.params)) {
        engine.setParameter(id, param, value);
      }
      ids.push(id);
    }

    // For drums, nodes aren't chained — they're parallel into a compressor
    if (layer.name === 'drums' && ids.length >= 4) {
      // ids[0]=kick, ids[1]=snare, ids[2]=hat, ids[3]=compressor, ids[4]=gain
      const kickId = ids[0];
      const snareId = ids[1];
      const hatId = ids[2];
      const compId = ids.length > 3 ? ids[3] : null;
      const gainId = ids[ids.length - 1];

      if (compId && compId !== gainId) {
        engine.connect(kickId, 'out', compId, 'in');
        engine.connect(snareId, 'out', compId, 'in');
        engine.connect(hatId, 'out', compId, 'in');
        engine.connect(compId, 'out', gainId, 'in');
      } else {
        engine.connect(kickId, 'out', gainId, 'in');
        engine.connect(snareId, 'out', gainId, 'in');
        engine.connect(hatId, 'out', gainId, 'in');
      }

      result.drumIds = { kick: kickId, snare: snareId, hat: hatId };
      result.layerGainIds.set('drums', gainId);
      return gainId;
    }

    // For bass, first two nodes are oscillators (saw + sub), rest is chain
    if (layer.name === 'bass' && ids.length >= 4) {
      const oscIds = ids.slice(0, 2);
      const chainIds = ids.slice(2);

      // Connect both oscillators to the first chain node (filter)
      for (const oscId of oscIds) {
        engine.connect(oscId, 'out', chainIds[0], 'in');
      }
      // Chain the rest
      for (let i = 0; i < chainIds.length - 1; i++) {
        engine.connect(chainIds[i], 'out', chainIds[i + 1], 'in');
      }

      result.bassOscIds = oscIds;
      result.bassFilterId = chainIds[0];
      const gainId = chainIds[chainIds.length - 1];
      result.layerGainIds.set('bass', gainId);
      return gainId;
    }

    // Default: chain nodes in series
    for (let i = 0; i < ids.length - 1; i++) {
      engine.connect(ids[i], 'out', ids[i + 1], 'in');
    }

    // Set up modulation
    if (layer.modulation) {
      for (const mod of layer.modulation) {
        const lfoId = engine.addNode('lfo');
        engine.setParameter(lfoId, 'rate', mod.rate);
        engine.setParameter(lfoId, 'depth', mod.depth);
        const targetId = ids[mod.targetNodeIndex];
        if (targetId) {
          engine.connect(lfoId, 'out', targetId, `${mod.targetParam}_mod`);
        }
      }
    }

    const gainId = ids[ids.length - 1];
    result.layerGainIds.set(layer.name, gainId);
    return gainId;
  }

  private static buildSequencers(engine: Chord, recipe: PatchRecipe, result: BuiltPatch) {
    for (const layer of recipe.layers) {
      if (!layer.sequencing) continue;

      switch (layer.sequencing.type) {
        case 'rhythm_engine': {
          if (!result.drumIds) break;
          const re = new RhythmEngine(engine, recipe.tempo);
          re.swing = layer.sequencing.swing ?? 0;

          // Build ride/hat pattern
          re.addTrack('ride', {
            nodeId: result.drumIds.hat,
            steps:       [0.8,0,0.4,0, 0.6,0,0.3,0, 0.8,0,0.4,0, 0.7,0,0.5,0],
            probability: [1,  0,0.7,0, 0.9,0,0.5,0, 1,  0,0.6,0, 0.9,0,0.7,0],
            velocityVariance: 0.15,
            humanize: layer.sequencing.humanize ?? 5,
            mutateEvery: layer.sequencing.mutateEvery ?? 4,
            velocityMap: { decay: [0.05, 0.18] },
          });

          // Kick pattern
          re.addTrack('kick', {
            nodeId: result.drumIds.kick,
            steps:       [0.9,0,0,0, 0,0,0,0, 0.7,0,0,0, 0,0,0.3,0],
            probability: [1,  0,0,0, 0,0,0,0, 0.6,0,0,0, 0,0,0.2,0],
            velocityVariance: 0.12,
            humanize: layer.sequencing.humanize ?? 5,
            mutateEvery: layer.sequencing.mutateEvery ?? 4,
          });

          // Snare with ghost notes
          re.addTrack('snare', {
            nodeId: result.drumIds.snare,
            steps:       [0,0.1,0,0.12, 0,0,0,0.08, 0.7,0.1,0,0.15, 0,0,0,0.1],
            probability: [0,0.3,0,0.2,  0,0,0,0.25, 1,  0.2,0,0.3,  0,0,0,0.15],
            velocityVariance: 0.2,
            humanize: (layer.sequencing.humanize ?? 5) * 1.5,
            mutateEvery: layer.sequencing.mutateEvery ?? 4,
            velocityMap: { snap: [0.05, 0.45] },
          });

          result.rhythm = re;
          break;
        }

        case 'harmonic': {
          const hs = new HarmonicSequencer(engine);
          const prog = this.buildDefaultProgression(recipe.key, recipe.scale);
          hs.setProgression(prog);
          result.harmony = hs;
          break;
        }

        case 'walking': {
          result.bass = new WalkingBassGenerator(engine);
          break;
        }
      }
    }

    // Always create a solo generator (it's on standby)
    result.solo = new SoloGenerator(engine);
  }

  /** Build a simple chord progression from key + scale */
  private static buildDefaultProgression(key: string, scale: string): ChordSymbol[] {
    const keyMap: Record<string, number> = {
      'C': 60, 'C#': 61, 'Db': 61, 'D': 62, 'D#': 63, 'Eb': 63,
      'E': 64, 'F': 65, 'F#': 66, 'Gb': 66, 'G': 67, 'G#': 68,
      'Ab': 68, 'A': 69, 'A#': 70, 'Bb': 70, 'B': 71,
    };
    const root = keyMap[key] ?? 60;

    if (scale === 'dorian' || scale === 'jazz') {
      // i → iv → bVII → i jazz vamp
      return [
        { name: `${key}m9`, root, tones: [0, 3, 7, 10, 14] },
        { name: `${key}m7/iv`, root: root + 5, tones: [0, 3, 7, 10, 14] },
        { name: `bVII7`, root: root + 10, tones: [0, 4, 7, 10, 14] },
        { name: `${key}m9`, root, tones: [0, 3, 7, 10, 14] },
      ];
    }

    // Default: I → vi → IV → V
    return [
      { name: `${key}maj7`, root, tones: [0, 4, 7, 11, 14] },
      { name: `${key}m7/vi`, root: root + 9, tones: [0, 3, 7, 10, 14] },
      { name: `IV7`, root: root + 5, tones: [0, 4, 7, 11, 14] },
      { name: `V7`, root: root + 7, tones: [0, 4, 7, 10, 14] },
    ];
  }
}
