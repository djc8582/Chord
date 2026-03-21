/**
 * MIDI Learn — captures incoming CC messages and creates mappings.
 *
 * When a MidiLearnSession is activated, it waits for the next incoming
 * ControlChange message. Once received, it captures the channel + CC number
 * and creates a mapping to the specified target parameter.
 */

import type { MidiMessage, ControlChange } from "./midi-types.js";
import { isControlChange } from "./midi-types.js";
import type { ControllerMapping, ScalingCurve } from "./controller-mapping.js";
import { createMapping } from "./controller-mapping.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The target that a MIDI learn session will map to. */
export interface LearnTarget {
  nodeId: string;
  param: string;
  min?: number;
  max?: number;
  curve?: ScalingCurve;
}

/** The state of a MIDI learn session. */
export type LearnState = "idle" | "listening" | "completed" | "cancelled" | "timed-out";

/** Options for creating a MIDI learn session. */
export interface MidiLearnOptions {
  /** Timeout in milliseconds. 0 or undefined means no timeout. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// MidiLearnSession
// ---------------------------------------------------------------------------

export class MidiLearnSession {
  private _state: LearnState = "idle";
  private _target: LearnTarget;
  private _result: ControllerMapping | null = null;
  private _resolve: ((mapping: ControllerMapping | null) => void) | null = null;
  private _timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private _timeoutMs: number;

  constructor(target: LearnTarget, options?: MidiLearnOptions) {
    this._target = target;
    this._timeoutMs = options?.timeoutMs ?? 0;
  }

  /** Current state of the session. */
  get state(): LearnState {
    return this._state;
  }

  /** The resulting mapping, if the session completed successfully. */
  get result(): ControllerMapping | null {
    return this._result;
  }

  /**
   * Start listening for an incoming CC message. Returns a Promise that
   * resolves with the created mapping, or null if cancelled/timed out.
   */
  start(): Promise<ControllerMapping | null> {
    if (this._state !== "idle") {
      throw new Error(`Cannot start session in state '${this._state}'`);
    }

    this._state = "listening";

    return new Promise<ControllerMapping | null>((resolve) => {
      this._resolve = resolve;

      if (this._timeoutMs > 0) {
        this._timeoutHandle = setTimeout(() => {
          if (this._state === "listening") {
            this._state = "timed-out";
            this._resolve?.(null);
            this._resolve = null;
          }
        }, this._timeoutMs);
      }
    });
  }

  /**
   * Feed an incoming MIDI message to the session. If the message is a
   * ControlChange and the session is listening, the mapping is created.
   *
   * Returns true if the message was consumed (session completed).
   */
  feed(message: MidiMessage): boolean {
    if (this._state !== "listening") {
      return false;
    }

    if (!isControlChange(message.data)) {
      return false;
    }

    const cc: ControlChange = message.data;

    const mapping = createMapping({
      midiChannel: cc.channel,
      midiCC: cc.controller,
      targetNodeId: this._target.nodeId,
      targetParam: this._target.param,
      min: this._target.min,
      max: this._target.max,
      curve: this._target.curve,
    });

    this._result = mapping;
    this._state = "completed";
    this._clearTimeout();
    this._resolve?.(mapping);
    this._resolve = null;

    return true;
  }

  /**
   * Cancel the session. The promise returned by `start()` resolves with null.
   */
  cancel(): void {
    if (this._state !== "listening") {
      return;
    }

    this._state = "cancelled";
    this._clearTimeout();
    this._resolve?.(null);
    this._resolve = null;
  }

  private _clearTimeout(): void {
    if (this._timeoutHandle !== null) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }
  }
}
