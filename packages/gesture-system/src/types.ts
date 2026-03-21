/**
 * Core types for the Chord gesture tracking system.
 *
 * These types define normalized control signals produced by MediaPipe-based
 * hand, body, and face trackers. Every coordinate is given in the [0,1]
 * normalized range output by MediaPipe, unless otherwise noted.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A 3-component vector (x, y, z) in normalized coordinates. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Hand tracking
// ---------------------------------------------------------------------------

/** Finger identifiers. */
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

/** All recognized gesture types. */
export type GestureType = 'pinch' | 'fist' | 'spread' | 'point' | 'thumbsUp' | 'peace' | 'none';

/** Handedness label. */
export type Handedness = 'Left' | 'Right';

/** Per-finger tracking data. */
export interface FingerData {
  /** Tip position in normalized coordinates. */
  position: Vec3;
  /** Whether the finger is considered extended. */
  isExtended: boolean;
}

/** Full landmark set for a single hand. */
export interface HandLandmarks {
  /** Per-finger data keyed by finger name. */
  fingers: Record<FingerName, FingerData>;
  /** Estimated center of the palm. */
  palmCenter: Vec3;
  /** Currently detected gestures. */
  gestures: GestureType[];
  /** Which hand (left / right). */
  handedness: Handedness;
  /** All 21 raw MediaPipe landmarks. */
  rawLandmarks: Vec3[];
}

/** Result emitted by HandTracker on each frame. */
export interface HandTrackingResult {
  /** One entry per detected hand. */
  hands: HandLandmarks[];
  /** Frame timestamp in milliseconds. */
  timestampMs: number;
}

// ---------------------------------------------------------------------------
// Body tracking
// ---------------------------------------------------------------------------

/** Major body joint identifiers (MediaPipe Pose 33-point model). */
export type BodyJointName =
  | 'nose'
  | 'leftEyeInner' | 'leftEye' | 'leftEyeOuter'
  | 'rightEyeInner' | 'rightEye' | 'rightEyeOuter'
  | 'leftEar' | 'rightEar'
  | 'mouthLeft' | 'mouthRight'
  | 'leftShoulder' | 'rightShoulder'
  | 'leftElbow' | 'rightElbow'
  | 'leftWrist' | 'rightWrist'
  | 'leftPinky' | 'rightPinky'
  | 'leftIndex' | 'rightIndex'
  | 'leftThumb' | 'rightThumb'
  | 'leftHip' | 'rightHip'
  | 'leftKnee' | 'rightKnee'
  | 'leftAnkle' | 'rightAnkle'
  | 'leftHeel' | 'rightHeel'
  | 'leftFootIndex' | 'rightFootIndex';

/** Data for a single body joint. */
export interface BodyJointData {
  position: Vec3;
  /** MediaPipe visibility score 0–1. */
  visibility: number;
}

/** Full landmark set for a detected body pose. */
export interface BodyLandmarks {
  joints: Partial<Record<BodyJointName, BodyJointData>>;
  /** All 33 raw MediaPipe landmarks. */
  rawLandmarks: Vec3[];
}

/** Result emitted by BodyTracker on each frame. */
export interface BodyTrackingResult {
  bodies: BodyLandmarks[];
  timestampMs: number;
}

// ---------------------------------------------------------------------------
// Face tracking
// ---------------------------------------------------------------------------

/** Recognized facial expressions (blendshape categories). */
export type FaceExpressionName =
  | 'mouthOpen'
  | 'mouthSmile'
  | 'mouthPucker'
  | 'eyeBlinkLeft'
  | 'eyeBlinkRight'
  | 'eyebrowRaiseLeft'
  | 'eyebrowRaiseRight'
  | 'jawOpen'
  | 'cheekPuff';

/** Expression data: a 0–1 confidence/intensity score. */
export interface FaceExpressionData {
  name: FaceExpressionName;
  /** 0 = not present, 1 = fully activated. */
  score: number;
}

/** Full landmark set for a detected face. */
export interface FaceLandmarks {
  /** Key expression scores. */
  expressions: Record<FaceExpressionName, number>;
  /** All raw MediaPipe face mesh landmarks (468 or 478 points). */
  rawLandmarks: Vec3[];
}

/** Result emitted by FaceTracker on each frame. */
export interface FaceTrackingResult {
  faces: FaceLandmarks[];
  timestampMs: number;
}

// ---------------------------------------------------------------------------
// Tracker configuration
// ---------------------------------------------------------------------------

/** Options shared by all tracker constructors. */
export interface TrackerOptions {
  /** Maximum number of subjects to detect (default 1). */
  maxDetections?: number;
  /** Minimum confidence for detection (0–1, default 0.5). */
  minDetectionConfidence?: number;
  /** Minimum confidence for tracking (0–1, default 0.5). */
  minTrackingConfidence?: number;
  /**
   * Path or URL to the MediaPipe WASM/model files.
   * When omitted, defaults to the CDN path.
   */
  modelAssetPath?: string;
  /**
   * Delegate for MediaPipe inference: 'CPU' or 'GPU'.
   * Defaults to 'GPU' when WebGL2 is available.
   */
  delegate?: 'CPU' | 'GPU';
}

/** Callback signature used by all trackers. */
export type FrameCallback<T> = (result: T) => void;

// ---------------------------------------------------------------------------
// Tracker events
// ---------------------------------------------------------------------------

/** Events emitted by trackers. */
export interface TrackerEvents<TResult> {
  /** Fired on every successfully processed frame. */
  frame: FrameCallback<TResult>;
  /** Fired when the tracker encounters an error. */
  error: (error: Error) => void;
  /** Fired when the tracker starts. */
  started: () => void;
  /** Fired when the tracker stops. */
  stopped: () => void;
}

/** Maps event name to listener signature. */
export type TrackerEventName = keyof TrackerEvents<unknown>;
