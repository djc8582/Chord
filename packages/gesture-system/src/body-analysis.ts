/**
 * Body tracking analysis from raw MediaPipe Pose landmarks.
 *
 * MediaPipe Pose outputs 33 landmarks. This module converts them into the
 * structured `BodyLandmarks` type.
 */

import type { BodyJointData, BodyJointName, BodyLandmarks, Vec3 } from './types.js';

// ---------------------------------------------------------------------------
// Landmark index → joint name mapping (MediaPipe Pose 33-point model)
// ---------------------------------------------------------------------------

const JOINT_INDEX_MAP: [number, BodyJointName][] = [
  [0, 'nose'],
  [1, 'leftEyeInner'],
  [2, 'leftEye'],
  [3, 'leftEyeOuter'],
  [4, 'rightEyeInner'],
  [5, 'rightEye'],
  [6, 'rightEyeOuter'],
  [7, 'leftEar'],
  [8, 'rightEar'],
  [9, 'mouthLeft'],
  [10, 'mouthRight'],
  [11, 'leftShoulder'],
  [12, 'rightShoulder'],
  [13, 'leftElbow'],
  [14, 'rightElbow'],
  [15, 'leftWrist'],
  [16, 'rightWrist'],
  [17, 'leftPinky'],
  [18, 'rightPinky'],
  [19, 'leftIndex'],
  [20, 'rightIndex'],
  [21, 'leftThumb'],
  [22, 'rightThumb'],
  [23, 'leftHip'],
  [24, 'rightHip'],
  [25, 'leftKnee'],
  [26, 'rightKnee'],
  [27, 'leftAnkle'],
  [28, 'rightAnkle'],
  [29, 'leftHeel'],
  [30, 'rightHeel'],
  [31, 'leftFootIndex'],
  [32, 'rightFootIndex'],
];

export { JOINT_INDEX_MAP };

// ---------------------------------------------------------------------------
// Raw landmark representation from MediaPipe
// ---------------------------------------------------------------------------

/** A raw pose landmark may carry a visibility score. */
export interface RawPoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// ---------------------------------------------------------------------------
// Transform raw landmarks to BodyLandmarks
// ---------------------------------------------------------------------------

/**
 * Build a `BodyLandmarks` from raw MediaPipe Pose landmark coordinates.
 *
 * @param rawLandmarks  Array of 33 landmark positions. Each may include
 *                      an optional `visibility` field.
 */
export function buildBodyLandmarks(
  rawLandmarks: RawPoseLandmark[],
): BodyLandmarks {
  const joints: Partial<Record<BodyJointName, BodyJointData>> = {};

  for (const [index, jointName] of JOINT_INDEX_MAP) {
    const lm = rawLandmarks[index];
    if (!lm) continue;
    joints[jointName] = {
      position: { x: lm.x, y: lm.y, z: lm.z },
      visibility: lm.visibility ?? 0,
    };
  }

  const vec3Landmarks: Vec3[] = rawLandmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
  }));

  return { joints, rawLandmarks: vec3Landmarks };
}
