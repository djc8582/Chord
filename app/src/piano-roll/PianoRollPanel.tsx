/**
 * PianoRollPanel — Shell-integrated wrapper for the PianoRoll.
 *
 * Adds:
 *  - Responsive sizing to fill the panel via ResizeObserver
 *  - Playhead animation synced with the shell transport
 *  - Piano key preview sounds using the Web Audio API
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PianoRoll } from "./PianoRoll";
import { usePianoRollStore } from "./store";
import { useShellStore } from "../shell/store.js";
import { useBridge } from "../bridge/index.js";

// ---------------------------------------------------------------------------
// Web Audio preview (lightweight sine tone for key audition)
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
let activePreviewOsc: OscillatorNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Convert a MIDI pitch to frequency in Hz (A4 = 440 Hz = MIDI 69).
 */
function midiToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/**
 * Play a short preview tone for a given MIDI pitch.
 * Automatically stops the previous preview if one is still sounding.
 */
function playPreviewNote(pitch: number): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  // Stop any currently sounding preview
  if (activePreviewOsc) {
    try {
      activePreviewOsc.stop();
    } catch {
      // Already stopped — ignore
    }
    activePreviewOsc = null;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = midiToFrequency(pitch);

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  // Quick fade-out after 0.3 seconds
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);

  activePreviewOsc = osc;

  osc.onended = () => {
    if (activePreviewOsc === osc) {
      activePreviewOsc = null;
    }
    osc.disconnect();
    gain.disconnect();
  };
}

// ---------------------------------------------------------------------------
// Playhead animation
// ---------------------------------------------------------------------------

const DEFAULT_TEMPO = 120;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PianoRollPanel: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const sequencerRafRef = useRef<number>(0);
  const [size, setSize] = useState({ width: 900, height: 400 });

  // Responsive sizing via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Subscribe to shell transport state
  const shellIsPlaying = useShellStore((s) => s.isPlaying);
  const shellTempo = useShellStore((s) => s.tempo);

  const setPlayheadBeat = usePianoRollStore((s) => s.setPlayheadBeat);
  const setIsPlaying = usePianoRollStore((s) => s.setIsPlaying);

  // Sync shell transport -> piano roll store
  useEffect(() => {
    setIsPlaying(shellIsPlaying);
  }, [shellIsPlaying, setIsPlaying]);

  // Playhead animation loop
  useEffect(() => {
    if (!shellIsPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      return;
    }

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = now;

      const tempo = shellTempo || DEFAULT_TEMPO;
      const beatsPerSecond = tempo / 60;
      const deltaBeat = beatsPerSecond * dt;

      const store = usePianoRollStore.getState();
      store.setPlayheadBeat(store.playheadBeat + deltaBeat);

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [shellIsPlaying, shellTempo, setPlayheadBeat]);

  // ── SEQUENCER: Trigger MIDI notes when playhead crosses note start/end ──
  const bridge = useBridge();
  const activeNotesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!shellIsPlaying) {
      // Stop all active notes when playback stops
      for (const pitch of activeNotesRef.current) {
        bridge.sendMidiNoteOff(pitch).catch(() => {});
      }
      activeNotesRef.current.clear();
      return;
    }

    let prevBeat = usePianoRollStore.getState().playheadBeat;

    const sequencerTick = () => {
      const store = usePianoRollStore.getState();
      const currentBeat = store.playheadBeat;
      const notes = store.notes;

      // Loop length: find the furthest note end, default 4 bars (16 beats)
      const loopEnd = notes.length > 0
        ? Math.max(...notes.map(n => n.start + n.duration), 16)
        : 16;

      // Wrap playhead for looping
      const wrappedBeat = currentBeat % loopEnd;
      const wrappedPrev = prevBeat % loopEnd;

      for (const note of notes) {
        const noteEnd = note.start + note.duration;

        // Check note-on: playhead crossed the note start
        const crossedStart = wrappedPrev < note.start && wrappedBeat >= note.start;
        // Also trigger on loop wrap
        const loopCrossed = wrappedBeat < wrappedPrev && note.start < wrappedBeat;

        if (crossedStart || loopCrossed) {
          if (!activeNotesRef.current.has(note.pitch)) {
            bridge.sendMidiNoteOn(note.pitch, note.velocity).catch(() => {});
            activeNotesRef.current.add(note.pitch);
          }
        }

        // Check note-off: playhead crossed the note end
        const crossedEnd = wrappedPrev < noteEnd && wrappedBeat >= noteEnd;
        if (crossedEnd || (loopCrossed && noteEnd <= wrappedBeat)) {
          if (activeNotesRef.current.has(note.pitch)) {
            bridge.sendMidiNoteOff(note.pitch).catch(() => {});
            activeNotesRef.current.delete(note.pitch);
          }
        }
      }

      prevBeat = currentBeat;
      sequencerRafRef.current = requestAnimationFrame(sequencerTick);
    };

    sequencerRafRef.current = requestAnimationFrame(sequencerTick);
    return () => {
      if (sequencerRafRef.current) cancelAnimationFrame(sequencerRafRef.current);
    };
  }, [shellIsPlaying, bridge]);

  // Key preview callback — plays Web Audio preview AND sends MIDI to backend
  const handleKeyClick = useCallback((pitch: number) => {
    playPreviewNote(pitch);
    // Send MIDI note-on to the backend engine so synth nodes hear it
    bridge.sendMidiNoteOn(pitch, 100).catch(() => {});
    // Auto note-off after 300ms
    setTimeout(() => {
      bridge.sendMidiNoteOff(pitch).catch(() => {});
    }, 300);
  }, [bridge]);

  return (
    <div
      ref={containerRef}
      data-testid="piano-roll-panel"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <PianoRoll
        width={size.width}
        height={size.height}
        onKeyClick={handleKeyClick}
      />
    </div>
  );
};

PianoRollPanel.displayName = "PianoRollPanel";
