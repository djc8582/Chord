/**
 * Gesture detection from raw hand landmarks.
 *
 * MediaPipe hand landmarks follow this layout (21 points per hand):
 *   0  = wrist
 *   1  = thumb CMC
 *   2  = thumb MCP
 *   3  = thumb IP
 *   4  = thumb TIP
 *   5  = index MCP
 *   6  = index PIP
 *   7  = index DIP
 *   8  = index TIP
 *   9  = middle MCP
 *  10  = middle PIP
 *  11  = middle DIP
 *  12  = middle TIP
 *  13  = ring MCP
 *  14  = ring PIP
 *  15  = ring DIP
 *  16  = ring TIP
 *  17  = pinky MCP
 *  18  = pinky PIP
 *  19  = pinky DIP
 *  20  = pinky TIP
 */

import type { FingerData, FingerName, GestureType, HandLandmarks, Handedness, Vec3 } from './types.js';

// ---------------------------------------------------------------------------
// Landmark index constants
// ---------------------------------------------------------------------------

export const WRIST = 0;

export const THUMB_CMC = 1;
export const THUMB_MCP = 2;
export const THUMB_IP = 3;
export const THUMB_TIP = 4;

export const INDEX_MCP = 5;
export const INDEX_PIP = 6;
export const INDEX_DIP = 7;
export const INDEX_TIP = 8;

export const MIDDLE_MCP = 9;
export const MIDDLE_PIP = 10;
export const MIDDLE_DIP = 11;
export const MIDDLE_TIP = 12;

export const RING_MCP = 13;
export const RING_PIP = 14;
export const RING_DIP = 15;
export const RING_TIP = 16;

export const PINKY_MCP = 17;
export const PINKY_PIP = 18;
export const PINKY_DIP = 19;
export const PINKY_TIP = 20;

// Map from finger name to (MCP, PIP, DIP, TIP) indices
const FINGER_INDICES: Record<FingerName, [number, number, number, number]> = {
  thumb: [THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP],
  index: [INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP],
  middle: [MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP],
  ring: [RING_MCP, RING_PIP, RING_DIP, RING_TIP],
  pinky: [PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP],
};

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

export function averagePoint(points: Vec3[]): Vec3 {
  const sum = { x: 0, y: 0, z: 0 };
  for (const p of points) {
    sum.x += p.x;
    sum.y += p.y;
    sum.z += p.z;
  }
  const n = points.length || 1;
  return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
}

// ---------------------------------------------------------------------------
// Finger extension detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a finger is extended by comparing the distance from
 * the finger tip to the wrist against the distance from the finger PIP
 * (proximal interphalangeal) joint to the wrist. Extended fingers have
 * their tip farther from the wrist than the PIP joint.
 *
 * For the thumb, we compare the tip-to-index-MCP distance against
 * the thumb-IP-to-index-MCP distance instead, because the thumb's
 * plane of movement differs from the other fingers.
 */
export function isFingerExtended(
  finger: FingerName,
  landmarks: Vec3[],
): boolean {
  if (landmarks.length < 21) return false;

  if (finger === 'thumb') {
    // Thumb: compare tip distance to index MCP against IP distance to index MCP
    const tipDist = distance(landmarks[THUMB_TIP], landmarks[INDEX_MCP]);
    const ipDist = distance(landmarks[THUMB_IP], landmarks[INDEX_MCP]);
    return tipDist > ipDist;
  }

  const [, pip, , tip] = FINGER_INDICES[finger];
  const wrist = landmarks[WRIST];
  const tipDist = distance(landmarks[tip], wrist);
  const pipDist = distance(landmarks[pip], wrist);
  return tipDist > pipDist;
}

// ---------------------------------------------------------------------------
// Gesture detection
// ---------------------------------------------------------------------------

/** Pinch: thumb tip close to index tip. */
function detectPinch(landmarks: Vec3[]): boolean {
  const d = distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]);
  return d < 0.06; // threshold in normalized coords
}

/** Fist: no fingers extended. */
function detectFist(landmarks: Vec3[]): boolean {
  const fingers: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  return fingers.every((f) => !isFingerExtended(f, landmarks));
}

/** Spread: all fingers extended. */
function detectSpread(landmarks: Vec3[]): boolean {
  const fingers: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  return fingers.every((f) => isFingerExtended(f, landmarks));
}

/** Point: only index extended. */
function detectPoint(landmarks: Vec3[]): boolean {
  return (
    isFingerExtended('index', landmarks) &&
    !isFingerExtended('middle', landmarks) &&
    !isFingerExtended('ring', landmarks) &&
    !isFingerExtended('pinky', landmarks)
  );
}

/** Thumbs up: only thumb extended. */
function detectThumbsUp(landmarks: Vec3[]): boolean {
  return (
    isFingerExtended('thumb', landmarks) &&
    !isFingerExtended('index', landmarks) &&
    !isFingerExtended('middle', landmarks) &&
    !isFingerExtended('ring', landmarks) &&
    !isFingerExtended('pinky', landmarks)
  );
}

/** Peace: index and middle extended, rest curled. */
function detectPeace(landmarks: Vec3[]): boolean {
  return (
    isFingerExtended('index', landmarks) &&
    isFingerExtended('middle', landmarks) &&
    !isFingerExtended('ring', landmarks) &&
    !isFingerExtended('pinky', landmarks)
  );
}

/** Detect all gestures present in the current landmarks. */
export function detectGestures(landmarks: Vec3[]): GestureType[] {
  if (landmarks.length < 21) return ['none'];

  const gestures: GestureType[] = [];

  if (detectPinch(landmarks)) gestures.push('pinch');
  if (detectFist(landmarks)) gestures.push('fist');
  if (detectSpread(landmarks)) gestures.push('spread');
  if (detectPoint(landmarks)) gestures.push('point');
  if (detectThumbsUp(landmarks)) gestures.push('thumbsUp');
  if (detectPeace(landmarks)) gestures.push('peace');

  return gestures.length > 0 ? gestures : ['none'];
}

// ---------------------------------------------------------------------------
// Compute palm center
// ---------------------------------------------------------------------------

/**
 * Estimate palm center as the average of wrist and all MCP joints.
 */
export function computePalmCenter(landmarks: Vec3[]): Vec3 {
  if (landmarks.length < 21) return { x: 0, y: 0, z: 0 };
  return averagePoint([
    landmarks[WRIST],
    landmarks[INDEX_MCP],
    landmarks[MIDDLE_MCP],
    landmarks[RING_MCP],
    landmarks[PINKY_MCP],
  ]);
}

// ---------------------------------------------------------------------------
// Build full HandLandmarks from raw data
// ---------------------------------------------------------------------------

/**
 * Transform raw MediaPipe landmark coordinates into the structured
 * `HandLandmarks` type consumed by the rest of the Chord system.
 */
export function buildHandLandmarks(
  rawLandmarks: Vec3[],
  handedness: Handedness,
): HandLandmarks {
  const fingerNames: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  const tipIndices: Record<FingerName, number> = {
    thumb: THUMB_TIP,
    index: INDEX_TIP,
    middle: MIDDLE_TIP,
    ring: RING_TIP,
    pinky: PINKY_TIP,
  };

  const fingers = {} as Record<FingerName, FingerData>;
  for (const name of fingerNames) {
    fingers[name] = {
      position: rawLandmarks[tipIndices[name]] ?? { x: 0, y: 0, z: 0 },
      isExtended: isFingerExtended(name, rawLandmarks),
    };
  }

  return {
    fingers,
    palmCenter: computePalmCenter(rawLandmarks),
    gestures: detectGestures(rawLandmarks),
    handedness,
    rawLandmarks,
  };
}
