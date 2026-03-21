/**
 * Mixer Store
 *
 * Zustand store that derives mixer channels from the document model nodes.
 * Each node that produces audio output gets a channel strip. The store
 * tracks per-channel solo/mute state, volume (gain), pan, and meter levels.
 *
 * Volume is stored in dB (-Infinity to +12) and converted to/from a linear
 * fader position (0..1) via the exported utility functions.
 */

import { create } from "zustand";
import type { NodeData } from "@chord/document-model";
import {
  getPatchDocument,
  setParameter as dmSetParameter,
} from "@chord/document-model";
import { useCanvasStore } from "../canvas/store.js";
import { NODE_TYPE_REGISTRY } from "../canvas/store.js";
import type { SignalStats } from "../bridge/types.js";

// ---------------------------------------------------------------------------
// dB / linear conversion utilities
// ---------------------------------------------------------------------------

/** Minimum dB value — represents silence. */
export const MIN_DB = -Infinity;
/** Maximum dB value for fader range. */
export const MAX_DB = 12;
/** The fader's dB range for the linear [0..1] mapping (maps 0 -> -96dB, 1 -> +12dB). */
export const FADER_MIN_DB = -96;

/**
 * Convert a linear fader position (0..1) to dB.
 * 0 maps to -Infinity (silence), values near 0 map to FADER_MIN_DB,
 * and 1 maps to MAX_DB.
 */
export function faderToDb(fader: number): number {
  if (fader <= 0) return -Infinity;
  if (fader >= 1) return MAX_DB;
  // Linear interpolation: fader 0->1 maps to FADER_MIN_DB..MAX_DB
  return FADER_MIN_DB + fader * (MAX_DB - FADER_MIN_DB);
}

/**
 * Convert dB to a linear fader position (0..1).
 */
export function dbToFader(db: number): number {
  if (!isFinite(db) || db <= FADER_MIN_DB) return 0;
  if (db >= MAX_DB) return 1;
  return (db - FADER_MIN_DB) / (MAX_DB - FADER_MIN_DB);
}

/**
 * Convert dB to a linear gain multiplier.
 */
export function dbToGain(db: number): number {
  if (!isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

/**
 * Convert a linear gain multiplier to dB.
 */
export function gainToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

/**
 * Map a signal level (in dB) to a normalized meter height (0..1).
 * Covers the range FADER_MIN_DB..MAX_DB.
 */
export function levelToMeterHeight(db: number): number {
  if (!isFinite(db) || db <= FADER_MIN_DB) return 0;
  if (db >= MAX_DB) return 1;
  return (db - FADER_MIN_DB) / (MAX_DB - FADER_MIN_DB);
}

/**
 * Determine the color zone for a given dB level.
 * green: below -6 dB, yellow: -6 to 0 dB, red: above 0 dB
 */
export function meterColor(db: number): "green" | "yellow" | "red" {
  if (db > 0) return "red";
  if (db > -6) return "yellow";
  return "green";
}

// ---------------------------------------------------------------------------
// Channel type
// ---------------------------------------------------------------------------

export interface MixerChannel {
  /** The node ID this channel corresponds to. */
  nodeId: string;
  /** Display name for the channel. */
  name: string;
  /** Node type (e.g. "oscillator", "filter"). */
  type: string;
  /** Volume in dB (-Infinity to +12). */
  volumeDb: number;
  /** Pan position (-1 = full left, 0 = center, +1 = full right). */
  pan: number;
  /** Whether this channel is muted. */
  muted: boolean;
  /** Whether this channel is soloed. */
  soloed: boolean;
  /** Optional color indicator for the channel strip. */
  color?: string;
  /** Peak level in dB (from signal stats). */
  peakDb: number;
  /** RMS level in dB (from signal stats). */
  rmsDb: number;
  /** Whether the channel is clipping. */
  clipping: boolean;
}

// ---------------------------------------------------------------------------
// Helpers: determine which nodes get mixer channels
// ---------------------------------------------------------------------------

/**
 * Returns true if a node type has at least one audio output port,
 * meaning it produces audio and should appear in the mixer.
 */
export function nodeHasAudioOutput(nodeType: string): boolean {
  const def = NODE_TYPE_REGISTRY[nodeType];
  if (!def) return false;
  return def.outputs.some((p) => p.type === "audio");
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface MixerStore {
  /** Derived channel list from document model nodes. */
  channels: MixerChannel[];

  /** The master channel (always present). */
  master: MixerChannel;

  /**
   * Derive mixer channels from the canvas store's Yjs document.
   * Should be called when the document changes.
   */
  syncFromDocument: () => void;

  /** Set volume (dB) for a channel. */
  setVolume: (nodeId: string, db: number) => void;

  /** Set pan for a channel (-1..+1). */
  setPan: (nodeId: string, pan: number) => void;

  /** Toggle mute for a channel. */
  toggleMute: (nodeId: string) => void;

  /** Toggle solo for a channel. */
  toggleSolo: (nodeId: string) => void;

  /** Clear all solos. */
  clearSolos: () => void;

  /** Update meter levels for a channel from signal stats. */
  updateMeter: (nodeId: string, stats: SignalStats) => void;

  /** Set master volume (dB). */
  setMasterVolume: (db: number) => void;

  /** Set master pan. */
  setMasterPan: (pan: number) => void;

  /** Toggle master mute. */
  toggleMasterMute: () => void;
}

// ---------------------------------------------------------------------------
// Default master channel
// ---------------------------------------------------------------------------

function createMasterChannel(): MixerChannel {
  return {
    nodeId: "__master__",
    name: "Master",
    type: "master",
    volumeDb: 0,
    pan: 0,
    muted: false,
    soloed: false,
    peakDb: -Infinity,
    rmsDb: -Infinity,
    clipping: false,
  };
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useMixerStore = create<MixerStore>((set, get) => ({
  channels: [],
  master: createMasterChannel(),

  syncFromDocument: () => {
    const canvasState = useCanvasStore.getState();
    const patch = getPatchDocument(canvasState.ydoc);
    const existingChannels = get().channels;

    const newChannels: MixerChannel[] = [];

    patch.nodes.forEach((nodeData: NodeData) => {
      if (!nodeHasAudioOutput(nodeData.type)) return;

      // Preserve existing channel state (solo, mute, meters) if it exists
      const existing = existingChannels.find((ch) => ch.nodeId === nodeData.id);

      // Derive volume from node's gain parameter (if present)
      const gainParam = nodeData.parameters.gain;
      const volumeDb =
        existing != null
          ? existing.volumeDb
          : gainParam != null
            ? gainToDb(gainParam)
            : 0;

      // Derive pan from node's pan parameter (if present)
      const panParam = nodeData.parameters.pan;
      const pan =
        existing != null
          ? existing.pan
          : panParam != null
            ? panParam
            : 0;

      newChannels.push({
        nodeId: nodeData.id,
        name: nodeData.name,
        type: nodeData.type,
        volumeDb,
        pan,
        muted: existing?.muted ?? false,
        soloed: existing?.soloed ?? false,
        color: nodeData.color,
        peakDb: existing?.peakDb ?? -Infinity,
        rmsDb: existing?.rmsDb ?? -Infinity,
        clipping: existing?.clipping ?? false,
      });
    });

    set({ channels: newChannels });
  },

  setVolume: (nodeId, db) => {
    const clamped = Math.min(MAX_DB, db);

    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.nodeId === nodeId ? { ...ch, volumeDb: clamped } : ch,
      ),
    }));

    // Update the document model gain parameter
    try {
      const canvasState = useCanvasStore.getState();
      dmSetParameter(canvasState.ydoc, nodeId, "gain", dbToGain(clamped));
    } catch {
      // Node may not exist yet — ignore
    }
  },

  setPan: (nodeId, pan) => {
    const clamped = Math.max(-1, Math.min(1, pan));

    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.nodeId === nodeId ? { ...ch, pan: clamped } : ch,
      ),
    }));

    // Update the document model pan parameter
    try {
      const canvasState = useCanvasStore.getState();
      dmSetParameter(canvasState.ydoc, nodeId, "pan", clamped);
    } catch {
      // Node may not exist yet — ignore
    }
  },

  toggleMute: (nodeId) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.nodeId === nodeId ? { ...ch, muted: !ch.muted } : ch,
      ),
    }));
  },

  toggleSolo: (nodeId) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.nodeId === nodeId ? { ...ch, soloed: !ch.soloed } : ch,
      ),
    }));
  },

  clearSolos: () => {
    set((state) => ({
      channels: state.channels.map((ch) => ({ ...ch, soloed: false })),
    }));
  },

  updateMeter: (nodeId, stats) => {
    const peakDb = stats.peak > 0 ? gainToDb(stats.peak) : -Infinity;
    const rmsDb = stats.rms > 0 ? gainToDb(stats.rms) : -Infinity;

    set((state) => {
      if (nodeId === "__master__") {
        return {
          master: {
            ...state.master,
            peakDb,
            rmsDb,
            clipping: stats.clipping,
          },
        };
      }

      return {
        channels: state.channels.map((ch) =>
          ch.nodeId === nodeId
            ? { ...ch, peakDb, rmsDb, clipping: stats.clipping }
            : ch,
        ),
      };
    });
  },

  setMasterVolume: (db) => {
    set((state) => ({
      master: { ...state.master, volumeDb: Math.min(MAX_DB, db) },
    }));
  },

  setMasterPan: (pan) => {
    set((state) => ({
      master: { ...state.master, pan: Math.max(-1, Math.min(1, pan)) },
    }));
  },

  toggleMasterMute: () => {
    set((state) => ({
      master: { ...state.master, muted: !state.master.muted },
    }));
  },
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

/**
 * Returns whether any channel is soloed. When true, only soloed channels
 * should be audible; all non-soloed channels are effectively muted.
 */
export function hasSoloActive(channels: MixerChannel[]): boolean {
  return channels.some((ch) => ch.soloed);
}

/**
 * Returns whether a channel should be audible given the current solo/mute state.
 */
export function isChannelAudible(
  channel: MixerChannel,
  anySoloed: boolean,
): boolean {
  if (channel.muted) return false;
  if (anySoloed && !channel.soloed) return false;
  return true;
}
