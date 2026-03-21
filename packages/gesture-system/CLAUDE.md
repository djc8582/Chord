# gesture-system

> **Tier 0** — No dependencies. Can be built immediately.

## What This Is

Wrappers around MediaPipe (hand, body, face tracking) and other gesture input sources. Outputs normalized control signals that can map to any parameter.

## Public API

```typescript
export class HandTracker {
  constructor(videoElement: HTMLVideoElement);
  start(): Promise<void>;
  stop(): void;
  onFrame(callback: (landmarks: HandLandmarks) => void): void;
}

export interface HandLandmarks {
  fingers: Record<FingerName, { position: Vec3; isExtended: boolean }>;
  palmCenter: Vec3;
  gestures: GestureType[]; // pinch, fist, spread, point, etc.
}

export class BodyTracker { /* similar API */ }
export class FaceTracker { /* similar API */ }
```

## Dependencies
- `@mediapipe/hands`, `@mediapipe/pose`, `@mediapipe/face_mesh`

## Definition of Done
- [ ] Hand tracking returns landmarks from webcam
- [ ] Gesture detection (pinch, spread, fist) works
- [ ] Body tracking returns joint positions
- [ ] Face tracking returns expression values (mouth open, eyebrow raise)
- [ ] All trackers achieve > 30fps
