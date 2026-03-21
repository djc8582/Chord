import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FaceTracker } from './face-tracker.js';
import type {
  FaceLandmarkerFactory,
  MediaPipeFaceLandmarker,
  MediaPipeFaceResult,
} from './face-tracker.js';
import type { FaceTrackingResult } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockVideoElement(): HTMLVideoElement {
  return {} as HTMLVideoElement;
}

/** Create 468 fake face landmarks with some structure. */
function fakeFaceLandmarks(): Array<{ x: number; y: number; z: number }> {
  const lm = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  // Add some mouth/eye structure so expressions are computable:
  lm[13]  = { x: 0.5, y: 0.48, z: 0 };  // upper lip
  lm[14]  = { x: 0.5, y: 0.56, z: 0 };  // lower lip
  lm[61]  = { x: 0.40, y: 0.52, z: 0 }; // mouth left
  lm[291] = { x: 0.60, y: 0.52, z: 0 }; // mouth right
  lm[234] = { x: 0.20, y: 0.5, z: 0 };  // left cheek
  lm[454] = { x: 0.80, y: 0.5, z: 0 };  // right cheek
  lm[159] = { x: 0.38, y: 0.40, z: 0 }; // left eye upper
  lm[145] = { x: 0.38, y: 0.42, z: 0 }; // left eye lower
  lm[386] = { x: 0.62, y: 0.40, z: 0 }; // right eye upper
  lm[374] = { x: 0.62, y: 0.42, z: 0 }; // right eye lower
  lm[1]   = { x: 0.5, y: 0.45, z: 0 };  // nose tip
  lm[152] = { x: 0.5, y: 0.75, z: 0 };  // jaw
  return lm;
}

function fakeFaceResult(n = 1): MediaPipeFaceResult {
  return {
    faceLandmarks: Array.from({ length: n }, () => fakeFaceLandmarks()),
  };
}

function createMockLandmarker(
  result: MediaPipeFaceResult = fakeFaceResult(),
): MediaPipeFaceLandmarker {
  return {
    detectForVideo: vi.fn(() => result),
    close: vi.fn(),
  };
}

function createMockFactory(
  landmarker: MediaPipeFaceLandmarker,
): FaceLandmarkerFactory {
  return vi.fn(async () => landmarker);
}

// ---------------------------------------------------------------------------
// rAF mocks
// ---------------------------------------------------------------------------

let rafCallbacks: Array<FrameRequestCallback> = [];
let rafId = 0;

function mockRaf(cb: FrameRequestCallback): number {
  rafId++;
  rafCallbacks.push(cb);
  return rafId;
}

function mockCancelRaf(): void {
  rafCallbacks = [];
}

function flushRaf(times = 1): void {
  for (let i = 0; i < times; i++) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of cbs) cb(performance.now());
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FaceTracker', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
    vi.stubGlobal('performance', { now: vi.fn(() => 3000) });
    rafCallbacks = [];
    rafId = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should construct without error', () => {
    const tracker = new FaceTracker(mockVideoElement());
    expect(tracker.running).toBe(false);
  });

  it('should start and emit "started"', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    const started = vi.fn();
    tracker.on('started', started);
    await tracker.start();

    expect(tracker.running).toBe(true);
    expect(started).toHaveBeenCalledOnce();
    tracker.stop();
  });

  it('should stop and emit "stopped", close landmarker', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    const stopped = vi.fn();
    tracker.on('stopped', stopped);

    await tracker.start();
    tracker.stop();

    expect(tracker.running).toBe(false);
    expect(stopped).toHaveBeenCalledOnce();
    expect(landmarker.close).toHaveBeenCalled();
  });

  it('should emit face tracking results with expression values', async () => {
    const landmarker = createMockLandmarker(fakeFaceResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    let result: FaceTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result).toBeDefined();
    expect(result!.faces).toHaveLength(1);

    const face = result!.faces[0];
    expect(face.expressions).toBeDefined();
    expect(typeof face.expressions.mouthOpen).toBe('number');
    expect(typeof face.expressions.mouthSmile).toBe('number');
    expect(typeof face.expressions.eyeBlinkLeft).toBe('number');
    expect(typeof face.expressions.eyeBlinkRight).toBe('number');
    expect(typeof face.expressions.eyebrowRaiseLeft).toBe('number');
    expect(typeof face.expressions.eyebrowRaiseRight).toBe('number');
    expect(typeof face.expressions.jawOpen).toBe('number');
    expect(typeof face.expressions.cheekPuff).toBe('number');
    expect(face.rawLandmarks).toHaveLength(468);

    tracker.stop();
  });

  it('should clamp expression values between 0 and 1', async () => {
    const landmarker = createMockLandmarker(fakeFaceResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    let result: FaceTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    const face = result!.faces[0];
    for (const val of Object.values(face.expressions)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }

    tracker.stop();
  });

  it('should handle empty results (no faces)', async () => {
    const emptyResult: MediaPipeFaceResult = { faceLandmarks: [] };
    const landmarker = createMockLandmarker(emptyResult);
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    let result: FaceTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.faces).toHaveLength(0);
    tracker.stop();
  });

  it('should detect multiple faces', async () => {
    const landmarker = createMockLandmarker(fakeFaceResult(3));
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), { maxDetections: 3 }, factory);

    let result: FaceTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.faces).toHaveLength(3);
    tracker.stop();
  });

  it('should emit "error" when factory rejects', async () => {
    const factory: FaceLandmarkerFactory = vi.fn(async () => {
      throw new Error('model load failed');
    });
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    const errors: Error[] = [];
    tracker.on('error', (err) => errors.push(err));

    await expect(tracker.start()).rejects.toThrow('model load failed');
    expect(errors).toHaveLength(1);
    expect(tracker.running).toBe(false);
  });

  it('should emit "error" when detectForVideo throws', async () => {
    const landmarker: MediaPipeFaceLandmarker = {
      detectForVideo: vi.fn(() => { throw new Error('detection failed'); }),
      close: vi.fn(),
    };
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    const errors: Error[] = [];
    tracker.on('error', (err) => errors.push(err));

    await tracker.start();
    flushRaf(1);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toBe('detection failed');
    tracker.stop();
  });

  it('should include timestampMs in results', async () => {
    const landmarker = createMockLandmarker(fakeFaceResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    let result: FaceTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.timestampMs).toBe(3000);
    tracker.stop();
  });

  it('should support onFrame convenience method', async () => {
    const landmarker = createMockLandmarker(fakeFaceResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new FaceTracker(mockVideoElement(), {}, factory);

    const results: FaceTrackingResult[] = [];
    tracker.onFrame((r) => results.push(r));

    await tracker.start();
    flushRaf(2);

    expect(results.length).toBeGreaterThanOrEqual(1);
    tracker.stop();
  });
});
