/**
 * Face expression analysis from raw MediaPipe face mesh landmarks.
 *
 * MediaPipe Face Mesh outputs 468 (or 478 with iris) landmarks.
 * We derive expression scores by measuring geometric relationships
 * between key landmark points.
 *
 * Landmark indices referenced here are from the canonical 468-point model:
 *   - Upper/lower lips, jaw, eyebrows, eyelids, etc.
 */

import type { FaceExpressionName, FaceLandmarks, Vec3 } from './types.js';
import { distance } from './gesture-detection.js';

// ---------------------------------------------------------------------------
// Key face landmark indices (canonical 468-point mesh)
// ---------------------------------------------------------------------------

/** Upper lip center */
const UPPER_LIP = 13;
/** Lower lip center */
const LOWER_LIP = 14;

/** Left mouth corner */
const MOUTH_LEFT = 61;
/** Right mouth corner */
const MOUTH_RIGHT = 291;

/** Left eye upper lid */
const LEFT_EYE_UPPER = 159;
/** Left eye lower lid */
const LEFT_EYE_LOWER = 145;

/** Right eye upper lid */
const RIGHT_EYE_UPPER = 386;
/** Right eye lower lid */
const RIGHT_EYE_LOWER = 374;

/** Left eyebrow top */
const LEFT_EYEBROW_TOP = 105;
/** Left eyebrow reference (eye top) */
const LEFT_EYE_TOP = 159;

/** Right eyebrow top */
const RIGHT_EYEBROW_TOP = 334;
/** Right eyebrow reference (eye top) */
const RIGHT_EYE_TOP = 386;

/** Jaw (chin) */
const JAW = 152;
/** Nose tip (reference for jaw open) */
const NOSE_TIP = 1;

/** Left cheek */
const LEFT_CHEEK = 234;
/** Right cheek */
const RIGHT_CHEEK = 454;

// ---------------------------------------------------------------------------
// Expression scoring
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Compute a normalized score for mouth openness.
 * Uses the vertical distance between upper and lower lip relative
 * to the horizontal mouth width.
 */
export function scoreMouthOpen(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const lipDist = distance(landmarks[UPPER_LIP], landmarks[LOWER_LIP]);
  const mouthWidth = distance(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]);
  if (mouthWidth === 0) return 0;
  // Ratio typically ranges from 0 (closed) to ~0.6 (wide open)
  return clamp01(lipDist / mouthWidth / 0.6);
}

/**
 * Compute a smile score based on the ratio of mouth width to
 * face width (approximated by cheek-to-cheek distance).
 */
export function scoreMouthSmile(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const mouthWidth = distance(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  // Smile widens the mouth relative to face; ratio ~0.35 neutral, ~0.5 smile
  const ratio = mouthWidth / faceWidth;
  return clamp01((ratio - 0.3) / 0.2);
}

/**
 * Pucker: inverse of smile (narrow mouth).
 */
export function scoreMouthPucker(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const mouthWidth = distance(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  const ratio = mouthWidth / faceWidth;
  return clamp01((0.3 - ratio) / 0.15);
}

/**
 * Left eye blink: the eyelid gap becomes very small.
 */
export function scoreEyeBlinkLeft(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const gap = distance(landmarks[LEFT_EYE_UPPER], landmarks[LEFT_EYE_LOWER]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  const ratio = gap / faceWidth;
  // ratio ~0.04 when open, ~0.01 when closed
  return clamp01(1 - ratio / 0.04);
}

/**
 * Right eye blink.
 */
export function scoreEyeBlinkRight(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const gap = distance(landmarks[RIGHT_EYE_UPPER], landmarks[RIGHT_EYE_LOWER]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  const ratio = gap / faceWidth;
  return clamp01(1 - ratio / 0.04);
}

/**
 * Left eyebrow raise: distance between eyebrow and eye top increases.
 */
export function scoreEyebrowRaiseLeft(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const gap = distance(landmarks[LEFT_EYEBROW_TOP], landmarks[LEFT_EYE_TOP]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  const ratio = gap / faceWidth;
  // Small gap when neutral, larger when raised
  return clamp01((ratio - 0.02) / 0.04);
}

/**
 * Right eyebrow raise.
 */
export function scoreEyebrowRaiseRight(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const gap = distance(landmarks[RIGHT_EYEBROW_TOP], landmarks[RIGHT_EYE_TOP]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  const ratio = gap / faceWidth;
  return clamp01((ratio - 0.02) / 0.04);
}

/**
 * Jaw open: distance from nose tip to chin.
 */
export function scoreJawOpen(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const jawDist = distance(landmarks[NOSE_TIP], landmarks[JAW]);
  const faceWidth = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  if (faceWidth === 0) return 0;
  const ratio = jawDist / faceWidth;
  // ratio ~0.45 neutral, ~0.65 open
  return clamp01((ratio - 0.45) / 0.2);
}

/**
 * Cheek puff: cheeks move outward, widening the lower face.
 * Approximated by cheek-to-cheek distance relative to the nose-jaw distance.
 */
export function scoreCheekPuff(landmarks: Vec3[]): number {
  if (landmarks.length < 468) return 0;
  const cheekDist = distance(landmarks[LEFT_CHEEK], landmarks[RIGHT_CHEEK]);
  const jawDist = distance(landmarks[NOSE_TIP], landmarks[JAW]);
  if (jawDist === 0) return 0;
  const ratio = cheekDist / jawDist;
  // Higher ratio → puffed cheeks
  return clamp01((ratio - 1.8) / 0.4);
}

// ---------------------------------------------------------------------------
// Aggregate expression computation
// ---------------------------------------------------------------------------

const expressionScorers: Record<FaceExpressionName, (lm: Vec3[]) => number> = {
  mouthOpen: scoreMouthOpen,
  mouthSmile: scoreMouthSmile,
  mouthPucker: scoreMouthPucker,
  eyeBlinkLeft: scoreEyeBlinkLeft,
  eyeBlinkRight: scoreEyeBlinkRight,
  eyebrowRaiseLeft: scoreEyebrowRaiseLeft,
  eyebrowRaiseRight: scoreEyebrowRaiseRight,
  jawOpen: scoreJawOpen,
  cheekPuff: scoreCheekPuff,
};

/**
 * Build the full `FaceLandmarks` object from raw MediaPipe face mesh
 * landmarks.
 */
export function buildFaceLandmarks(rawLandmarks: Vec3[]): FaceLandmarks {
  const expressions = {} as Record<FaceExpressionName, number>;
  for (const [name, scorer] of Object.entries(expressionScorers)) {
    expressions[name as FaceExpressionName] = scorer(rawLandmarks);
  }
  return { expressions, rawLandmarks };
}
