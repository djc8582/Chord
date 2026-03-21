/**
 * FaceTracker — wraps MediaPipe Face Landmarker for real-time face tracking.
 *
 * Usage:
 *   const tracker = new FaceTracker(videoElement);
 *   tracker.onFrame((result) => {
 *     const mouthOpen = result.faces[0]?.expressions.mouthOpen;
 *   });
 *   await tracker.start();
 *   tracker.stop();
 */

import { TypedEventEmitter } from './event-emitter.js';
import { buildFaceLandmarks } from './face-expression.js';
import type {
  FaceTrackingResult,
  FrameCallback,
  TrackerEvents,
  TrackerOptions,
  Vec3,
} from './types.js';

// ---------------------------------------------------------------------------
// MediaPipe type stubs
// ---------------------------------------------------------------------------

export interface MediaPipeFaceLandmarker {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number,
  ): MediaPipeFaceResult;
  close(): void;
}

export interface MediaPipeFaceResult {
  faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
}

/** Factory function type that creates a FaceLandmarker. */
export type FaceLandmarkerFactory = (
  options: TrackerOptions,
) => Promise<MediaPipeFaceLandmarker>;

// ---------------------------------------------------------------------------
// Default factory
// ---------------------------------------------------------------------------

let defaultFaceFactory: FaceLandmarkerFactory | undefined;

async function getDefaultFaceFactory(): Promise<FaceLandmarkerFactory> {
  if (defaultFaceFactory) return defaultFaceFactory;
  const vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker, FilesetResolver } = vision;

  defaultFaceFactory = async (opts: TrackerOptions) => {
    const wasmFileset = await FilesetResolver.forVisionTasks(
      opts.modelAssetPath ??
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );
    return FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        delegate: opts.delegate ?? 'GPU',
      },
      numFaces: opts.maxDetections ?? 1,
      runningMode: 'VIDEO',
      minFaceDetectionConfidence: opts.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
    }) as unknown as Promise<MediaPipeFaceLandmarker>;
  };
  return defaultFaceFactory;
}

// ---------------------------------------------------------------------------
// FaceTracker class
// ---------------------------------------------------------------------------

type FaceTrackerEvents = TrackerEvents<FaceTrackingResult>;

export class FaceTracker extends TypedEventEmitter<FaceTrackerEvents> {
  private videoElement: HTMLVideoElement;
  private options: TrackerOptions;
  private landmarker: MediaPipeFaceLandmarker | null = null;
  private animationFrameId: number | null = null;
  private _running = false;
  private customFactory: FaceLandmarkerFactory | null;

  constructor(
    videoElement: HTMLVideoElement,
    options: TrackerOptions = {},
    factory?: FaceLandmarkerFactory,
  ) {
    super();
    this.videoElement = videoElement;
    this.options = options;
    this.customFactory = factory ?? null;
  }

  get running(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    if (this._running) return;

    try {
      const factory =
        this.customFactory ?? (await getDefaultFaceFactory());
      this.landmarker = await factory(this.options);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }

    this._running = true;
    this.emit('started');
    this.tick();
  }

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

  onFrame(callback: FrameCallback<FaceTrackingResult>): void {
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
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private transformResult(
    mpResult: MediaPipeFaceResult,
    timestampMs: number,
  ): FaceTrackingResult {
    const faces = (mpResult.faceLandmarks ?? []).map((rawLms) => {
      const landmarks: Vec3[] = rawLms.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
      }));
      return buildFaceLandmarks(landmarks);
    });

    return { faces, timestampMs };
  }
}
