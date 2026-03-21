/**
 * Integration tests that validate the public API surface of @chord/gesture-system.
 *
 * These tests verify:
 * - All expected exports are present
 * - Types compile correctly (verified via usage in tests)
 * - End-to-end flow from raw data → structured results
 */

import { describe, it, expect } from 'vitest';
import {
  // Trackers
  HandTracker,
  BodyTracker,
  FaceTracker,

  // Detection / analysis utilities
  buildHandLandmarks,
  detectGestures,
  computePalmCenter,
  isFingerExtended,
  distance,
  midpoint,
  averagePoint,
  buildBodyLandmarks,
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

  // Event emitter
  TypedEventEmitter,
} from './index.js';

import type {
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
  HandLandmarkerFactory,
  MediaPipeHandLandmarker,
  MediaPipeHandResult,
  PoseLandmarkerFactory,
  MediaPipePoseLandmarker,
  MediaPipePoseResult,
  FaceLandmarkerFactory,
  MediaPipeFaceLandmarker,
  MediaPipeFaceResult,
  RawPoseLandmark,
} from './index.js';

// ---------------------------------------------------------------------------
// Export existence
// ---------------------------------------------------------------------------

describe('Public API exports', () => {
  it('should export HandTracker class', () => {
    expect(HandTracker).toBeDefined();
    expect(typeof HandTracker).toBe('function');
  });

  it('should export BodyTracker class', () => {
    expect(BodyTracker).toBeDefined();
    expect(typeof BodyTracker).toBe('function');
  });

  it('should export FaceTracker class', () => {
    expect(FaceTracker).toBeDefined();
    expect(typeof FaceTracker).toBe('function');
  });

  it('should export TypedEventEmitter class', () => {
    expect(TypedEventEmitter).toBeDefined();
  });

  it('should export gesture detection utilities', () => {
    expect(typeof buildHandLandmarks).toBe('function');
    expect(typeof detectGestures).toBe('function');
    expect(typeof computePalmCenter).toBe('function');
    expect(typeof isFingerExtended).toBe('function');
    expect(typeof distance).toBe('function');
    expect(typeof midpoint).toBe('function');
    expect(typeof averagePoint).toBe('function');
  });

  it('should export body analysis utilities', () => {
    expect(typeof buildBodyLandmarks).toBe('function');
  });

  it('should export face expression utilities', () => {
    expect(typeof buildFaceLandmarks).toBe('function');
    expect(typeof scoreMouthOpen).toBe('function');
    expect(typeof scoreMouthSmile).toBe('function');
    expect(typeof scoreMouthPucker).toBe('function');
    expect(typeof scoreEyeBlinkLeft).toBe('function');
    expect(typeof scoreEyeBlinkRight).toBe('function');
    expect(typeof scoreEyebrowRaiseLeft).toBe('function');
    expect(typeof scoreEyebrowRaiseRight).toBe('function');
    expect(typeof scoreJawOpen).toBe('function');
    expect(typeof scoreCheekPuff).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Type integration (compile-time checks via usage)
// ---------------------------------------------------------------------------

describe('Type integration', () => {
  it('should allow constructing a Vec3', () => {
    const v: Vec3 = { x: 1, y: 2, z: 3 };
    expect(v.x).toBe(1);
  });

  it('should allow using FingerName as keys', () => {
    const fingers: Record<FingerName, boolean> = {
      thumb: true,
      index: false,
      middle: true,
      ring: false,
      pinky: true,
    };
    expect(fingers.thumb).toBe(true);
  });

  it('should allow GestureType values', () => {
    const gestures: GestureType[] = ['pinch', 'fist', 'spread', 'point', 'thumbsUp', 'peace', 'none'];
    expect(gestures).toHaveLength(7);
  });

  it('should allow Handedness values', () => {
    const h: Handedness = 'Left';
    expect(h).toBe('Left');
  });

  it('should allow BodyJointName values', () => {
    const joints: BodyJointName[] = [
      'nose', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip',
      'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
    ];
    expect(joints.length).toBeGreaterThan(0);
  });

  it('should allow FaceExpressionName values', () => {
    const expressions: FaceExpressionName[] = [
      'mouthOpen', 'mouthSmile', 'mouthPucker',
      'eyeBlinkLeft', 'eyeBlinkRight',
      'eyebrowRaiseLeft', 'eyebrowRaiseRight',
      'jawOpen', 'cheekPuff',
    ];
    expect(expressions).toHaveLength(9);
  });

  it('should allow TrackerOptions configuration', () => {
    const opts: TrackerOptions = {
      maxDetections: 2,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
      modelAssetPath: '/custom/path',
      delegate: 'CPU',
    };
    expect(opts.maxDetections).toBe(2);
  });

  it('should compile FrameCallback type', () => {
    const cb: FrameCallback<HandTrackingResult> = (result) => {
      // Verify the type is correct by accessing properties
      const _hands = result.hands;
      const _ts = result.timestampMs;
      void _hands;
      void _ts;
    };
    expect(typeof cb).toBe('function');
  });

  it('should compile tracker event names', () => {
    const events: TrackerEventName[] = ['frame', 'error', 'started', 'stopped'];
    expect(events).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// End-to-end data flow
// ---------------------------------------------------------------------------

describe('End-to-end data flow', () => {
  it('should process hand landmarks through the full pipeline', () => {
    // Simulate what the tracker does internally
    const rawLandmarks: Vec3[] = Array.from({ length: 21 }, (_, i) => ({
      x: i / 21,
      y: 1 - i / 21,
      z: 0,
    }));

    const handLandmarks: HandLandmarks = buildHandLandmarks(rawLandmarks, 'Right');

    // Verify the complete structure
    expect(handLandmarks.handedness).toBe('Right');
    expect(handLandmarks.rawLandmarks).toHaveLength(21);
    expect(handLandmarks.palmCenter).toBeDefined();
    expect(handLandmarks.gestures.length).toBeGreaterThan(0);
    expect(handLandmarks.fingers.thumb).toBeDefined();
    expect(handLandmarks.fingers.index).toBeDefined();
    expect(handLandmarks.fingers.middle).toBeDefined();
    expect(handLandmarks.fingers.ring).toBeDefined();
    expect(handLandmarks.fingers.pinky).toBeDefined();

    // Each finger should have position and isExtended
    for (const finger of Object.values(handLandmarks.fingers)) {
      expect(finger.position).toHaveProperty('x');
      expect(finger.position).toHaveProperty('y');
      expect(finger.position).toHaveProperty('z');
      expect(typeof finger.isExtended).toBe('boolean');
    }
  });

  it('should process body landmarks through the full pipeline', () => {
    const rawPose: RawPoseLandmark[] = Array.from({ length: 33 }, (_, i) => ({
      x: i / 33,
      y: 1 - i / 33,
      z: 0.01 * i,
      visibility: 0.95,
    }));

    const bodyLandmarks: BodyLandmarks = buildBodyLandmarks(rawPose);

    expect(bodyLandmarks.rawLandmarks).toHaveLength(33);
    expect(bodyLandmarks.joints.nose).toBeDefined();
    expect(bodyLandmarks.joints.leftShoulder).toBeDefined();
    expect(bodyLandmarks.joints.rightShoulder).toBeDefined();

    // Joint data should have position and visibility
    const nose = bodyLandmarks.joints.nose!;
    expect(nose.position.x).toBeCloseTo(0);
    expect(nose.visibility).toBeCloseTo(0.95);
  });

  it('should process face landmarks through the full pipeline', () => {
    // Create a face with enough landmarks and some structure
    const rawFace: Vec3[] = Array.from({ length: 468 }, () => ({
      x: 0.5, y: 0.5, z: 0,
    }));
    // Set up structure for expression detection
    rawFace[13]  = { x: 0.5, y: 0.45, z: 0 };
    rawFace[14]  = { x: 0.5, y: 0.58, z: 0 };
    rawFace[61]  = { x: 0.40, y: 0.5, z: 0 };
    rawFace[291] = { x: 0.60, y: 0.5, z: 0 };
    rawFace[234] = { x: 0.2, y: 0.5, z: 0 };
    rawFace[454] = { x: 0.8, y: 0.5, z: 0 };

    const faceLandmarks: FaceLandmarks = buildFaceLandmarks(rawFace);

    expect(faceLandmarks.rawLandmarks).toHaveLength(468);
    expect(faceLandmarks.expressions.mouthOpen).toBeGreaterThanOrEqual(0);
    expect(faceLandmarks.expressions.mouthOpen).toBeLessThanOrEqual(1);

    // All expressions should be numbers in [0,1]
    for (const [name, val] of Object.entries(faceLandmarks.expressions)) {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Performance-related (> 30fps contract)
// ---------------------------------------------------------------------------

describe('Performance contract (>30fps)', () => {
  it('should process hand landmark transformation in < 1ms', () => {
    const lm: Vec3[] = Array.from({ length: 21 }, (_, i) => ({
      x: i / 21, y: 1 - i / 21, z: 0,
    }));

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      buildHandLandmarks(lm, 'Right');
    }
    const elapsed = Date.now() - start;

    // 1000 iterations in < 1000ms → < 1ms per call → easily > 30fps
    expect(elapsed).toBeLessThan(1000);
  });

  it('should process body landmark transformation in < 1ms', () => {
    const lm: RawPoseLandmark[] = Array.from({ length: 33 }, (_, i) => ({
      x: i / 33, y: 1 - i / 33, z: 0, visibility: 0.9,
    }));

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      buildBodyLandmarks(lm);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('should process face landmark transformation in < 1ms', () => {
    const lm: Vec3[] = Array.from({ length: 468 }, () => ({
      x: 0.5, y: 0.5, z: 0,
    }));

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      buildFaceLandmarks(lm);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('should process gesture detection in < 1ms', () => {
    const lm: Vec3[] = Array.from({ length: 21 }, (_, i) => ({
      x: i / 21, y: 1 - i / 21, z: 0,
    }));

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      detectGestures(lm);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});
