import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BodyTracker } from './body-tracker.js';
import type {
  PoseLandmarkerFactory,
  MediaPipePoseLandmarker,
  MediaPipePoseResult,
} from './body-tracker.js';
import type { BodyTrackingResult } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockVideoElement(): HTMLVideoElement {
  return {} as HTMLVideoElement;
}

function fakePoseLandmarks(): Array<{ x: number; y: number; z: number; visibility?: number }> {
  return Array.from({ length: 33 }, (_, i) => ({
    x: i / 33,
    y: 1 - i / 33,
    z: 0.01 * i,
    visibility: 0.9,
  }));
}

function fakePoseResult(n = 1): MediaPipePoseResult {
  return {
    landmarks: Array.from({ length: n }, () => fakePoseLandmarks()),
  };
}

function createMockLandmarker(
  result: MediaPipePoseResult = fakePoseResult(),
): MediaPipePoseLandmarker {
  return {
    detectForVideo: vi.fn(() => result),
    close: vi.fn(),
  };
}

function createMockFactory(
  landmarker: MediaPipePoseLandmarker,
): PoseLandmarkerFactory {
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

describe('BodyTracker', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
    vi.stubGlobal('performance', { now: vi.fn(() => 2000) });
    rafCallbacks = [];
    rafId = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should construct without error', () => {
    const tracker = new BodyTracker(mockVideoElement());
    expect(tracker.running).toBe(false);
  });

  it('should start and emit "started"', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

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
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    const stopped = vi.fn();
    tracker.on('stopped', stopped);

    await tracker.start();
    tracker.stop();

    expect(tracker.running).toBe(false);
    expect(stopped).toHaveBeenCalledOnce();
    expect(landmarker.close).toHaveBeenCalled();
  });

  it('should emit body tracking results with joint positions', async () => {
    const landmarker = createMockLandmarker(fakePoseResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    let result: BodyTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result).toBeDefined();
    expect(result!.bodies).toHaveLength(1);

    const body = result!.bodies[0];
    expect(body.joints.nose).toBeDefined();
    expect(body.joints.leftShoulder).toBeDefined();
    expect(body.joints.rightShoulder).toBeDefined();
    expect(body.joints.leftHip).toBeDefined();
    expect(body.joints.rightHip).toBeDefined();
    expect(body.rawLandmarks).toHaveLength(33);

    tracker.stop();
  });

  it('should include visibility in joint data', async () => {
    const landmarker = createMockLandmarker(fakePoseResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    let result: BodyTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    const nose = result!.bodies[0].joints.nose;
    expect(nose!.visibility).toBeCloseTo(0.9);

    tracker.stop();
  });

  it('should handle empty results (no bodies)', async () => {
    const emptyResult: MediaPipePoseResult = { landmarks: [] };
    const landmarker = createMockLandmarker(emptyResult);
    const factory = createMockFactory(landmarker);
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    let result: BodyTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.bodies).toHaveLength(0);
    tracker.stop();
  });

  it('should emit "error" when factory rejects', async () => {
    const factory: PoseLandmarkerFactory = vi.fn(async () => {
      throw new Error('model load failed');
    });
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    const errors: Error[] = [];
    tracker.on('error', (err) => errors.push(err));

    await expect(tracker.start()).rejects.toThrow('model load failed');
    expect(errors).toHaveLength(1);
    expect(tracker.running).toBe(false);
  });

  it('should emit "error" when detectForVideo throws', async () => {
    const landmarker: MediaPipePoseLandmarker = {
      detectForVideo: vi.fn(() => { throw new Error('detect error'); }),
      close: vi.fn(),
    };
    const factory = createMockFactory(landmarker);
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    const errors: Error[] = [];
    tracker.on('error', (err) => errors.push(err));

    await tracker.start();
    flushRaf(1);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toBe('detect error');
    tracker.stop();
  });

  it('should include timestampMs in results', async () => {
    const landmarker = createMockLandmarker(fakePoseResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new BodyTracker(mockVideoElement(), {}, factory);

    let result: BodyTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.timestampMs).toBe(2000);
    tracker.stop();
  });
});
