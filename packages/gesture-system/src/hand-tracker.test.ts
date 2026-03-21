import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HandTracker } from './hand-tracker.js';
import type {
  HandLandmarkerFactory,
  MediaPipeHandLandmarker,
  MediaPipeHandResult,
} from './hand-tracker.js';
import type { HandTrackingResult, TrackerOptions, Vec3 } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Create a mock video element. */
function mockVideoElement(): HTMLVideoElement {
  return {} as HTMLVideoElement;
}

/** Generate 21 fake hand landmarks. */
function fakeHandLandmarks(): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: 21 }, (_, i) => ({
    x: i / 21,
    y: 1 - i / 21,
    z: 0.01 * i,
  }));
}

/** Build a mock MediaPipeHandResult with `n` hands. */
function fakeHandResult(n = 1): MediaPipeHandResult {
  return {
    landmarks: Array.from({ length: n }, () => fakeHandLandmarks()),
    handedness: Array.from({ length: n }, (_, i) => [
      { categoryName: i === 0 ? 'Right' : 'Left' },
    ]),
  };
}

/** Create a mock landmarker. */
function createMockLandmarker(
  result: MediaPipeHandResult = fakeHandResult(),
): MediaPipeHandLandmarker {
  return {
    detectForVideo: vi.fn(() => result),
    close: vi.fn(),
  };
}

/** Factory that immediately returns the mock. */
function createMockFactory(
  landmarker: MediaPipeHandLandmarker,
): HandLandmarkerFactory {
  return vi.fn(async () => landmarker);
}

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

let rafCallbacks: Array<FrameRequestCallback> = [];
let rafId = 0;

function mockRequestAnimationFrame(cb: FrameRequestCallback): number {
  rafId++;
  rafCallbacks.push(cb);
  return rafId;
}

function mockCancelAnimationFrame(): void {
  rafCallbacks = [];
}

function flushRaf(times = 1): void {
  for (let i = 0; i < times; i++) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of cbs) {
      cb(performance.now());
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandTracker', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', mockCancelAnimationFrame);
    vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
    rafCallbacks = [];
    rafId = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should construct without throwing', () => {
    const tracker = new HandTracker(mockVideoElement());
    expect(tracker).toBeDefined();
    expect(tracker.running).toBe(false);
  });

  it('should start and emit "started" event', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    const started = vi.fn();
    tracker.on('started', started);
    await tracker.start();

    expect(tracker.running).toBe(true);
    expect(started).toHaveBeenCalledOnce();
    tracker.stop();
  });

  it('should stop and emit "stopped" event', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    const stopped = vi.fn();
    tracker.on('stopped', stopped);

    await tracker.start();
    tracker.stop();

    expect(tracker.running).toBe(false);
    expect(stopped).toHaveBeenCalledOnce();
    expect(landmarker.close).toHaveBeenCalledOnce();
  });

  it('should not start twice', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    await tracker.start();
    await tracker.start(); // second call should be a no-op

    expect(factory).toHaveBeenCalledTimes(1);
    tracker.stop();
  });

  it('should not stop if not running', () => {
    const tracker = new HandTracker(mockVideoElement());
    const stopped = vi.fn();
    tracker.on('stopped', stopped);
    tracker.stop();
    expect(stopped).not.toHaveBeenCalled();
  });

  it('should emit "frame" events via the tracking loop', async () => {
    const landmarker = createMockLandmarker(fakeHandResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    const frameResults: HandTrackingResult[] = [];
    tracker.onFrame((result) => frameResults.push(result));

    await tracker.start();
    // The first tick runs during start(); subsequent ticks need rAF flush
    flushRaf(3);

    expect(frameResults.length).toBeGreaterThanOrEqual(1);
    expect(frameResults[0].hands).toHaveLength(1);
    expect(frameResults[0].hands[0].handedness).toBe('Right');
    expect(frameResults[0].timestampMs).toBeDefined();

    tracker.stop();
  });

  it('should transform raw landmarks into HandLandmarks', async () => {
    const landmarker = createMockLandmarker(fakeHandResult(1));
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    let result: HandTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result).toBeDefined();
    const hand = result!.hands[0];
    expect(hand.fingers).toBeDefined();
    expect(hand.fingers.thumb).toBeDefined();
    expect(hand.fingers.index).toBeDefined();
    expect(hand.palmCenter).toBeDefined();
    expect(hand.gestures).toBeDefined();
    expect(hand.rawLandmarks).toHaveLength(21);

    tracker.stop();
  });

  it('should detect multiple hands', async () => {
    const landmarker = createMockLandmarker(fakeHandResult(2));
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), { maxDetections: 2 }, factory);

    let result: HandTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.hands).toHaveLength(2);
    expect(result!.hands[0].handedness).toBe('Right');
    expect(result!.hands[1].handedness).toBe('Left');

    tracker.stop();
  });

  it('should pass options to the factory', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const opts: TrackerOptions = {
      maxDetections: 2,
      minDetectionConfidence: 0.7,
      delegate: 'CPU',
    };
    const tracker = new HandTracker(mockVideoElement(), opts, factory);

    await tracker.start();
    expect(factory).toHaveBeenCalledWith(opts);
    tracker.stop();
  });

  it('should emit "error" when the factory throws', async () => {
    const factory: HandLandmarkerFactory = vi.fn(async () => {
      throw new Error('load failed');
    });
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    const errors: Error[] = [];
    tracker.on('error', (err) => errors.push(err));

    await expect(tracker.start()).rejects.toThrow('load failed');
    expect(errors).toHaveLength(1);
    expect(tracker.running).toBe(false);
  });

  it('should emit "error" when detectForVideo throws', async () => {
    const landmarker: MediaPipeHandLandmarker = {
      detectForVideo: vi.fn(() => {
        throw new Error('detection error');
      }),
      close: vi.fn(),
    };
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    const errors: Error[] = [];
    tracker.on('error', (err) => errors.push(err));

    await tracker.start();
    flushRaf(1);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toBe('detection error');

    tracker.stop();
  });

  it('should handle empty results (no hands detected)', async () => {
    const emptyResult: MediaPipeHandResult = { landmarks: [], handedness: [] };
    const landmarker = createMockLandmarker(emptyResult);
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    let result: HandTrackingResult | undefined;
    tracker.onFrame((r) => { result = r; });

    await tracker.start();
    flushRaf(1);

    expect(result!.hands).toHaveLength(0);
    tracker.stop();
  });

  it('should close landmarker on stop', async () => {
    const landmarker = createMockLandmarker();
    const factory = createMockFactory(landmarker);
    const tracker = new HandTracker(mockVideoElement(), {}, factory);

    await tracker.start();
    tracker.stop();

    expect(landmarker.close).toHaveBeenCalled();
  });
});
