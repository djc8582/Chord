/**
 * HandTracker — wraps MediaPipe Hand Landmarker for real-time hand tracking.
 *
 * Usage:
 *   const tracker = new HandTracker(videoElement, { maxDetections: 2 });
 *   tracker.onFrame((result) => console.log(result));
 *   await tracker.start();
 *   // ... later
 *   tracker.stop();
 */

import { TypedEventEmitter } from './event-emitter.js';
import { buildHandLandmarks } from './gesture-detection.js';
import type {
  FrameCallback,
  Handedness,
  HandTrackingResult,
  TrackerEvents,
  TrackerOptions,
  Vec3,
} from './types.js';

// ---------------------------------------------------------------------------
// MediaPipe type stubs
// ---------------------------------------------------------------------------
// We declare minimal type shapes so the module compiles without importing
// the full MediaPipe package at the type level. The real MediaPipe objects
// are loaded at runtime.

/** Minimal MediaPipe HandLandmarker interface for our wrapper. */
export interface MediaPipeHandLandmarker {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number,
  ): MediaPipeHandResult;
  close(): void;
}

export interface MediaPipeHandResult {
  landmarks: Array<Array<{ x: number; y: number; z: number }>>;
  handedness: Array<Array<{ categoryName: string }>>;
}

/** Factory function type that creates a HandLandmarker. */
export type HandLandmarkerFactory = (
  options: TrackerOptions,
) => Promise<MediaPipeHandLandmarker>;

// ---------------------------------------------------------------------------
// Default factory — loads from @mediapipe/tasks-vision
// ---------------------------------------------------------------------------

let defaultHandFactory: HandLandmarkerFactory | undefined;

/**
 * Lazily creates the default factory that uses
 * `@mediapipe/tasks-vision` to instantiate a HandLandmarker.
 */
async function getDefaultHandFactory(): Promise<HandLandmarkerFactory> {
  if (defaultHandFactory) return defaultHandFactory;
  // Dynamic import so the module can be loaded without side-effects in
  // test environments that don't have the MediaPipe WASM available.
  const vision = await import('@mediapipe/tasks-vision');
  const { HandLandmarker, FilesetResolver } = vision;

  defaultHandFactory = async (opts: TrackerOptions) => {
    const wasmFileset = await FilesetResolver.forVisionTasks(
      opts.modelAssetPath ??
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );
    return HandLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        delegate: opts.delegate ?? 'GPU',
      },
      numHands: opts.maxDetections ?? 1,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: opts.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
    }) as unknown as Promise<MediaPipeHandLandmarker>;
  };
  return defaultHandFactory;
}

// ---------------------------------------------------------------------------
// HandTracker class
// ---------------------------------------------------------------------------

type HandTrackerEvents = TrackerEvents<HandTrackingResult>;

export class HandTracker extends TypedEventEmitter<HandTrackerEvents> {
  private videoElement: HTMLVideoElement;
  private options: TrackerOptions;
  private landmarker: MediaPipeHandLandmarker | null = null;
  private animationFrameId: number | null = null;
  private _running = false;
  private customFactory: HandLandmarkerFactory | null;

  constructor(
    videoElement: HTMLVideoElement,
    options: TrackerOptions = {},
    /** Allows injecting a custom factory for testing. */
    factory?: HandLandmarkerFactory,
  ) {
    super();
    this.videoElement = videoElement;
    this.options = options;
    this.customFactory = factory ?? null;
  }

  /** Whether the tracking loop is currently active. */
  get running(): boolean {
    return this._running;
  }

  /**
   * Initialize the MediaPipe hand landmarker and begin the tracking loop.
   */
  async start(): Promise<void> {
    if (this._running) return;

    try {
      const factory =
        this.customFactory ?? (await getDefaultHandFactory());
      this.landmarker = await factory(this.options);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }

    this._running = true;
    this.emit('started');
    this.tick();
  }

  /**
   * Stop the tracking loop and release the MediaPipe resources.
   */
  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    this.emit('stopped');
  }

  /**
   * Convenience method: register a frame callback.
   * This is equivalent to `tracker.on('frame', callback)`.
   */
  onFrame(callback: FrameCallback<HandTrackingResult>): void {
    this.on('frame', callback);
  }

  // -----------------------------------------------------------------------
  // Internal loop
  // -----------------------------------------------------------------------

  private tick = (): void => {
    if (!this._running || !this.landmarker) return;

    try {
      const timestampMs = performance.now();
      const mpResult = this.landmarker.detectForVideo(
        this.videoElement,
        timestampMs,
      );

      const result = this.transformResult(mpResult, timestampMs);
      this.emit('frame', result);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /** Transform MediaPipe raw output into our typed result. */
  private transformResult(
    mpResult: MediaPipeHandResult,
    timestampMs: number,
  ): HandTrackingResult {
    const hands = (mpResult.landmarks ?? []).map((rawLms, i) => {
      const landmarks: Vec3[] = rawLms.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
      }));

      const handednessInfo = mpResult.handedness?.[i]?.[0];
      const handedness: Handedness =
        (handednessInfo?.categoryName as Handedness) ?? 'Right';

      return buildHandLandmarks(landmarks, handedness);
    });

    return { hands, timestampMs };
  }
}
