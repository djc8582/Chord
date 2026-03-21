/**
 * Controller mapping types and value scaling.
 *
 * A ControllerMapping binds a MIDI CC (channel + controller number) to a
 * specific parameter on a specific node in the patch graph.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Curve type for value scaling between MIDI range and parameter range. */
export type ScalingCurve = "linear" | "logarithmic" | "exponential";

/** A mapping from a MIDI CC to a node parameter. */
export interface ControllerMapping {
  /** Unique identifier for this mapping. */
  id: string;
  /** MIDI channel (0-15). */
  midiChannel: number;
  /** MIDI CC number (0-127). */
  midiCC: number;
  /** ID of the target node in the patch graph. */
  targetNodeId: string;
  /** Name of the parameter on the target node. */
  targetParam: string;
  /** Minimum value of the parameter range. */
  min: number;
  /** Maximum value of the parameter range. */
  max: number;
  /** Scaling curve type. */
  curve: ScalingCurve;
}

// ---------------------------------------------------------------------------
// Value scaling
// ---------------------------------------------------------------------------

/**
 * Scale a raw MIDI CC value (0-127) to the parameter's target range using
 * the specified curve.
 *
 * - **linear**: proportional mapping
 * - **logarithmic**: slower at the bottom, faster at the top (good for frequency)
 * - **exponential**: faster at the bottom, slower at the top (good for volume)
 */
export function scaleValue(
  rawCC: number,
  min: number,
  max: number,
  curve: ScalingCurve,
): number {
  // Normalize raw CC to 0..1
  const normalized = Math.max(0, Math.min(1, rawCC / 127));

  let shaped: number;
  switch (curve) {
    case "linear":
      shaped = normalized;
      break;
    case "logarithmic":
      // log curve: slow start, fast finish
      // Uses log(1 + x*9) / log(10) to map [0,1] -> [0,1] with log shape
      shaped = Math.log10(1 + normalized * 9);
      break;
    case "exponential":
      // exponential curve: fast start slow finish
      // Uses (10^x - 1) / 9 to map [0,1] -> [0,1] with exp shape
      shaped = (Math.pow(10, normalized) - 1) / 9;
      break;
  }

  return min + shaped * (max - min);
}

/**
 * Apply a controller mapping to a raw MIDI CC value, returning the scaled
 * parameter value.
 */
export function applyMapping(mapping: ControllerMapping, rawCC: number): number {
  return scaleValue(rawCC, mapping.min, mapping.max, mapping.curve);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate a ControllerMapping, returning an error string or null if valid. */
export function validateMapping(mapping: ControllerMapping): string | null {
  if (!mapping.id || typeof mapping.id !== "string") {
    return "mapping must have a non-empty string id";
  }
  if (!Number.isInteger(mapping.midiChannel) || mapping.midiChannel < 0 || mapping.midiChannel > 15) {
    return "midiChannel must be an integer 0-15";
  }
  if (!Number.isInteger(mapping.midiCC) || mapping.midiCC < 0 || mapping.midiCC > 127) {
    return "midiCC must be an integer 0-127";
  }
  if (!mapping.targetNodeId || typeof mapping.targetNodeId !== "string") {
    return "targetNodeId must be a non-empty string";
  }
  if (!mapping.targetParam || typeof mapping.targetParam !== "string") {
    return "targetParam must be a non-empty string";
  }
  if (typeof mapping.min !== "number" || !isFinite(mapping.min)) {
    return "min must be a finite number";
  }
  if (typeof mapping.max !== "number" || !isFinite(mapping.max)) {
    return "max must be a finite number";
  }
  if (mapping.min >= mapping.max) {
    return "min must be less than max";
  }
  if (!["linear", "logarithmic", "exponential"].includes(mapping.curve)) {
    return "curve must be 'linear', 'logarithmic', or 'exponential'";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _nextId = 1;

/** Generate a unique mapping ID. */
export function generateMappingId(): string {
  return `mapping-${_nextId++}`;
}

/** Reset the ID counter (for testing). */
export function resetMappingIdCounter(): void {
  _nextId = 1;
}

/** Create a ControllerMapping with defaults for optional fields. */
export function createMapping(params: {
  id?: string;
  midiChannel: number;
  midiCC: number;
  targetNodeId: string;
  targetParam: string;
  min?: number;
  max?: number;
  curve?: ScalingCurve;
}): ControllerMapping {
  return {
    id: params.id ?? generateMappingId(),
    midiChannel: params.midiChannel,
    midiCC: params.midiCC,
    targetNodeId: params.targetNodeId,
    targetParam: params.targetParam,
    min: params.min ?? 0,
    max: params.max ?? 1,
    curve: params.curve ?? "linear",
  };
}
