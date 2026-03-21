/**
 * @chord/gesture-system
 *
 * Wrappers around MediaPipe (hand, body, face tracking) and other gesture
 * input sources. Outputs normalized control signals that can map to any
 * parameter in the Chord audio graph.
 *
 * @example
 * ```typescript
 * import { HandTracker, BodyTracker, FaceTracker } from '@chord/gesture-system';
 *
 * const video = document.querySelector('video')!;
 * const hands = new HandTracker(video, { maxDetections: 2 });
 * hands.onFrame((result) => {
 *   for (const hand of result.hands) {
 *     console.log(hand.gestures, hand.palmCenter);
 *   }
 * });
 * await hands.start();
 * ```
 */

// Types — public interface
export type {
  Vec3,
  FingerName,
  GestureType,
  Handedness,
  FingerData,
  HandLandmarks,
  HandTrackingResult,
  BodyJointName,
  BodyJointData,
  BodyLandmarks,
  BodyTrackingResult,
  FaceExpressionName,
  FaceExpressionData,
  FaceLandmarks,
  FaceTrackingResult,
  TrackerOptions,
  FrameCallback,
  TrackerEvents,
  TrackerEventName,
} from './types.js';

// Trackers
export { HandTracker } from './hand-tracker.js';
export type {
  MediaPipeHandLandmarker,
  MediaPipeHandResult,
  HandLandmarkerFactory,
} from './hand-tracker.js';

export { BodyTracker } from './body-tracker.js';
export type {
  MediaPipePoseLandmarker,
  MediaPipePoseResult,
  PoseLandmarkerFactory,
} from './body-tracker.js';

export { FaceTracker } from './face-tracker.js';
export type {
  MediaPipeFaceLandmarker,
  MediaPipeFaceResult,
  FaceLandmarkerFactory,
} from './face-tracker.js';

// Analysis / detection utilities
export {
  buildHandLandmarks,
  detectGestures,
  computePalmCenter,
  isFingerExtended,
  distance,
  midpoint,
  averagePoint,
} from './gesture-detection.js';

export { buildBodyLandmarks } from './body-analysis.js';
export type { RawPoseLandmark } from './body-analysis.js';

export {
  buildFaceLandmarks,
  scoreMouthOpen,
  scoreMouthSmile,
  scoreMouthPucker,
  scoreEyeBlinkLeft,
  scoreEyeBlinkRight,
  scoreEyebrowRaiseLeft,
  scoreEyebrowRaiseRight,
  scoreJawOpen,
  scoreCheekPuff,
} from './face-expression.js';

// Event emitter (useful for consumers extending the system)
export { TypedEventEmitter } from './event-emitter.js';
