import { describe, it, expect } from 'vitest';
import { buildBodyLandmarks, JOINT_INDEX_MAP, type RawPoseLandmark } from './body-analysis.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate 33 fake pose landmarks with optional visibility. */
function fakePoseLandmarks(visibility = 0.9): RawPoseLandmark[] {
  return Array.from({ length: 33 }, (_, i) => ({
    x: i / 33,
    y: 1 - i / 33,
    z: 0.01 * i,
    visibility,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildBodyLandmarks', () => {
  it('should map all 33 landmarks to named joints', () => {
    const raw = fakePoseLandmarks();
    const result = buildBodyLandmarks(raw);

    // Verify all expected joints are present
    for (const [, name] of JOINT_INDEX_MAP) {
      expect(result.joints[name]).toBeDefined();
    }
  });

  it('should correctly position the nose joint (index 0)', () => {
    const raw = fakePoseLandmarks();
    const result = buildBodyLandmarks(raw);
    const nose = result.joints.nose;
    expect(nose).toBeDefined();
    expect(nose!.position.x).toBeCloseTo(0 / 33);
    expect(nose!.position.y).toBeCloseTo(1);
    expect(nose!.visibility).toBeCloseTo(0.9);
  });

  it('should correctly position the leftShoulder (index 11)', () => {
    const raw = fakePoseLandmarks();
    const result = buildBodyLandmarks(raw);
    const ls = result.joints.leftShoulder;
    expect(ls).toBeDefined();
    expect(ls!.position.x).toBeCloseTo(11 / 33);
  });

  it('should preserve visibility values', () => {
    const raw = fakePoseLandmarks(0.75);
    const result = buildBodyLandmarks(raw);
    expect(result.joints.leftHip!.visibility).toBeCloseTo(0.75);
  });

  it('should default visibility to 0 when not provided', () => {
    const raw: RawPoseLandmark[] = Array.from({ length: 33 }, (_, i) => ({
      x: i / 33,
      y: 0,
      z: 0,
      // no visibility field
    }));
    const result = buildBodyLandmarks(raw);
    expect(result.joints.nose!.visibility).toBe(0);
  });

  it('should include rawLandmarks as Vec3 (without visibility)', () => {
    const raw = fakePoseLandmarks();
    const result = buildBodyLandmarks(raw);
    expect(result.rawLandmarks).toHaveLength(33);
    for (const lm of result.rawLandmarks) {
      expect(lm).toHaveProperty('x');
      expect(lm).toHaveProperty('y');
      expect(lm).toHaveProperty('z');
      expect(lm).not.toHaveProperty('visibility');
    }
  });

  it('should handle fewer than 33 landmarks gracefully', () => {
    const raw: RawPoseLandmark[] = [{ x: 0.1, y: 0.2, z: 0.3, visibility: 1 }];
    const result = buildBodyLandmarks(raw);
    // Only index 0 → nose should be set
    expect(result.joints.nose).toBeDefined();
    expect(result.joints.leftShoulder).toBeUndefined();
    expect(result.rawLandmarks).toHaveLength(1);
  });

  it('should handle empty landmarks', () => {
    const result = buildBodyLandmarks([]);
    expect(Object.keys(result.joints)).toHaveLength(0);
    expect(result.rawLandmarks).toHaveLength(0);
  });
});
