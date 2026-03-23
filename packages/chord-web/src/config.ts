/**
 * Chord project configuration.
 * Used by chord.config.ts in the project root.
 */

export interface ChordConfig {
  /** Directory containing patch files (default: './patches') */
  patchDir?: string;
  /** Output directory for built patches (default: './dist/audio') */
  outDir?: string;
  /** Default export target */
  target?: 'web' | 'react' | 'vanilla' | 'node';
  /** Named patches */
  patches?: Record<string, string>;
  /** Global defaults */
  defaults?: {
    sampleRate?: number;
    masterLimiter?: boolean;
    autoGainStaging?: boolean;
  };
  /** React-specific options */
  react?: {
    generateHooks?: boolean;
  };
}

/**
 * Define a Chord project configuration.
 * Used in chord.config.ts:
 *
 *   import { defineConfig } from 'chord-audio/config';
 *   export default defineConfig({ ... });
 */
export function defineConfig(config: ChordConfig): ChordConfig {
  return {
    patchDir: './patches',
    outDir: './dist/audio',
    target: 'web',
    ...config,
    defaults: {
      sampleRate: 48000,
      masterLimiter: true,
      autoGainStaging: true,
      ...config.defaults,
    },
  };
}
