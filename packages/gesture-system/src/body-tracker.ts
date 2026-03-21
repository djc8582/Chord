/**
 * BodyTracker — wraps MediaPipe Pose Landmarker for real-time body tracking.
 *
 * Usage:
 *   const tracker = new BodyTracker(videoElement);
 *   tracker.onFrame((result) => console.log(result.bodies[0]?.joints.leftShoulder));
 *   await tracker.start();
 *   tracker.stop();
 */

import { TypedEventEmitter } from './event-emitter.js';
import { buildBodyLandmarks, type RawPoseLandmark } from './body-analysis.js';
import type {
  BodyTrackingResult,
  FrameCallback,
  TrackerEvents,
  TrackerOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// MediaPipe type stubs
// ---------------------------------------------------------------------------

export interface MediaPipePoseLandmarker {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number,
  ): MediaPipePoseResult;
  close(): void;
}

export interface MediaPipePoseResult {
  landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
}

/** Factory function type that creates a PoseLandmarker. */
export type PoseLandmarkerFactory = (
  options: TrackerOptions,
) => Promise<MediaPipePoseLandmarker>;

// ---------------------------------------------------------------------------
// Default factory
// ---------------------------------------------------------------------------

let defaultPoseFactory: PoseLandmarkerFactory | undefined;

async function getDefaultPoseFactory(): Promise<PoseLandmarkerFactory> {
  if (defaultPoseFactory) return defaultPoseFactory;
  const vision = await import('@mediapipe/tasks-vision');
  const { PoseLandmarker, FilesetResolver } = vision;

  defaultPoseFactory = async (opts: TrackerOptions) => {
    const wasmFileset = await FilesetResolver.forVisionTasks(
      opts.modelAssetPath ??
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );
    return PoseLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        delegate: opts.delegate ?? 'GPU',
      },
      numPoses: opts.maxDetections ?? 1,
      runningMode: 'VIDEO',
      minPoseDetectionConfidence: opts.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
    }) as unknown as Promise<MediaPipePoseLandmarker>;
  };
  return defaultPoseFactory;
}

// ---------------------------------------------------------------------------
// BodyTracker class
// ---------------------------------------------------------------------------

type BodyTrackerEvents = TrackerEvents<BodyTrackingResult>;

export class BodyTracker extends TypedEventEmitter<BodyTrackerEvents> {
  private videoElement: HTMLVideoElement;
  private options: TrackerOptions;
  private landmarker: MediaPipePoseLandmarker | null = null;
  private animationFrameId: number | null = null;
  private _running = false;
  private customFactory: PoseLandmarkerFactory | null;

  constructor(
    videoElement: HTMLVideoElement,
    options: TrackerOptions = {},
    factory?: PoseLandmarkerFactory,
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
        this.customFactory ?? (await getDefaultPoseFactory());
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

  onFrame(callback: FrameCallback<BodyTrackingResult>): void {
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
    mpResult: MediaPipePoseResult,
    timestampMs: number,
  ): BodyTrackingResult {
    const bodies = (mpResult.landmarks ?? []).map((rawLms) => {
      const poseLandmarks: RawPoseLandmark[] = rawLms.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      }));
      return buildBodyLandmarks(poseLandmarks);
    });

    return { bodies, timestampMs };
  }
}
