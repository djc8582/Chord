export interface PatchRecipe {
  tempo: number;
  key: string;
  scale: string;
  layers: LayerRecipe[];
  effects: EffectChainRecipe;
}

export interface LayerRecipe {
  name: string;
  nodes: NodeRecipe[];
  modulation?: ModulationRecipe[];
  sequencing?: SequencingConfig;
}

export interface NodeRecipe {
  type: string;
  params: Record<string, number>;
}

export interface ModulationRecipe {
  sourceType: string; // 'lfo'
  targetNodeIndex: number; // index into layer.nodes
  targetParam: string;
  rate: number;
  depth: number;
}

export interface SequencingConfig {
  type: 'rhythm_engine' | 'harmonic' | 'walking' | 'root' | 'arpeggio' | 'none';
  swing?: number;
  humanize?: number;
  mutateEvery?: number;
  density?: number;
  style?: string;
  energy?: number;
}

export interface EffectChainRecipe {
  reverb: { room_size: number; damping: number; mix: number };
  delay: { time: number; feedback: number; mix: number };
  compressor: { threshold: number; ratio: number; attack: number; release: number };
}

export interface GenreProfile {
  name: string;
  tempoRange: [number, number];
  defaultTempo: number;
  swing: number;
  humanization: number;
  defaultScale: string;
  reverbSize: number;
  reverbMix: number;
  drumStyle: string;
  bassStyle: string;
  harmonyStyle: string;
  layers: string[];
}
