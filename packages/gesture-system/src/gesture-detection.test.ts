import { describe, it, expect } from 'vitest';
import {
  distance,
  midpoint,
  averagePoint,
  isFingerExtended,
  detectGestures,
  computePalmCenter,
  buildHandLandmarks,
  WRIST,
  THUMB_TIP,
  INDEX_TIP,
  INDEX_MCP,
  MIDDLE_MCP,
  RING_MCP,
  PINKY_MCP,
} from './gesture-detection.js';
import type { Vec3, FingerName, GestureType } from './types.js';

// ---------------------------------------------------------------------------
// Helpers to build fake landmark arrays
// ---------------------------------------------------------------------------

/** Generate 21 landmarks where every point starts at (0.5, 0.5, 0). */
function neutralHand(): Vec3[] {
  return Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

/**
 * Build a hand with extended fingers by placing tips far from the wrist
 * and PIP joints close to the wrist.
 */
function openHand(): Vec3[] {
  const lm = neutralHand();
  // Wrist at center-bottom
  lm[WRIST] = { x: 0.5, y: 0.8, z: 0 };

  // Thumb: tip far from index MCP, IP close to index MCP
  lm[1] = { x: 0.45, y: 0.7, z: 0 }; // thumb CMC
  lm[2] = { x: 0.40, y: 0.6, z: 0 }; // thumb MCP
  lm[3] = { x: 0.35, y: 0.55, z: 0 }; // thumb IP
  lm[4] = { x: 0.28, y: 0.48, z: 0 }; // thumb TIP (far from index MCP)

  // Index finger (extended)
  lm[5] = { x: 0.45, y: 0.6, z: 0 }; // index MCP
  lm[6] = { x: 0.45, y: 0.5, z: 0 }; // index PIP
  lm[7] = { x: 0.45, y: 0.4, z: 0 }; // index DIP
  lm[8] = { x: 0.45, y: 0.3, z: 0 }; // index TIP

  // Middle finger (extended)
  lm[9]  = { x: 0.5, y: 0.6, z: 0 };  // middle MCP
  lm[10] = { x: 0.5, y: 0.5, z: 0 };  // middle PIP
  lm[11] = { x: 0.5, y: 0.4, z: 0 };  // middle DIP
  lm[12] = { x: 0.5, y: 0.28, z: 0 }; // middle TIP

  // Ring finger (extended)
  lm[13] = { x: 0.55, y: 0.6, z: 0 };  // ring MCP
  lm[14] = { x: 0.55, y: 0.5, z: 0 };  // ring PIP
  lm[15] = { x: 0.55, y: 0.4, z: 0 };  // ring DIP
  lm[16] = { x: 0.55, y: 0.3, z: 0 };  // ring TIP

  // Pinky (extended)
  lm[17] = { x: 0.6, y: 0.63, z: 0 }; // pinky MCP
  lm[18] = { x: 0.6, y: 0.53, z: 0 }; // pinky PIP
  lm[19] = { x: 0.6, y: 0.43, z: 0 }; // pinky DIP
  lm[20] = { x: 0.6, y: 0.33, z: 0 }; // pinky TIP

  return lm;
}

/** Build a closed fist: all tips curl past PIP towards wrist. */
function closedFist(): Vec3[] {
  const lm = neutralHand();
  lm[WRIST] = { x: 0.5, y: 0.8, z: 0 };

  // Thumb: tip close to index MCP (curled)
  lm[1] = { x: 0.45, y: 0.7, z: 0 };
  lm[2] = { x: 0.42, y: 0.65, z: 0 };
  lm[3] = { x: 0.40, y: 0.55, z: 0 }; // thumb IP
  lm[4] = { x: 0.43, y: 0.60, z: 0 }; // thumb TIP close to index MCP

  // Index (curled — tip closer to wrist than PIP)
  lm[5] = { x: 0.45, y: 0.6, z: 0 };  // MCP
  lm[6] = { x: 0.45, y: 0.55, z: 0 }; // PIP
  lm[7] = { x: 0.45, y: 0.62, z: 0 }; // DIP (curled back)
  lm[8] = { x: 0.45, y: 0.7, z: 0 };  // TIP (near wrist)

  // Middle (curled)
  lm[9]  = { x: 0.5, y: 0.6, z: 0 };
  lm[10] = { x: 0.5, y: 0.55, z: 0 };
  lm[11] = { x: 0.5, y: 0.62, z: 0 };
  lm[12] = { x: 0.5, y: 0.7, z: 0 };

  // Ring (curled)
  lm[13] = { x: 0.55, y: 0.6, z: 0 };
  lm[14] = { x: 0.55, y: 0.55, z: 0 };
  lm[15] = { x: 0.55, y: 0.62, z: 0 };
  lm[16] = { x: 0.55, y: 0.7, z: 0 };

  // Pinky (curled)
  lm[17] = { x: 0.6, y: 0.63, z: 0 };
  lm[18] = { x: 0.6, y: 0.58, z: 0 };
  lm[19] = { x: 0.6, y: 0.64, z: 0 };
  lm[20] = { x: 0.6, y: 0.72, z: 0 };

  return lm;
}

/** Build a pointing hand: only index extended. */
function pointingHand(): Vec3[] {
  const lm = closedFist();
  // Extend only the index finger
  lm[6] = { x: 0.45, y: 0.5, z: 0 };  // PIP
  lm[7] = { x: 0.45, y: 0.4, z: 0 };  // DIP
  lm[8] = { x: 0.45, y: 0.3, z: 0 };  // TIP (far from wrist)
  return lm;
}

/** Build a pinch: thumb tip and index tip very close together. */
function pinchHand(): Vec3[] {
  const lm = closedFist();
  // Position thumb and index tips very close
  lm[4] = { x: 0.45, y: 0.45, z: 0 }; // thumb TIP
  lm[8] = { x: 0.46, y: 0.45, z: 0 }; // index TIP
  return lm;
}

/** Peace sign: index and middle extended, rest curled. */
function peaceHand(): Vec3[] {
  const lm = closedFist();
  // Extend index
  lm[6] = { x: 0.45, y: 0.5, z: 0 };
  lm[7] = { x: 0.45, y: 0.4, z: 0 };
  lm[8] = { x: 0.45, y: 0.3, z: 0 };
  // Extend middle
  lm[10] = { x: 0.5, y: 0.5, z: 0 };
  lm[11] = { x: 0.5, y: 0.4, z: 0 };
  lm[12] = { x: 0.5, y: 0.28, z: 0 };
  return lm;
}

/** Thumbs up: only thumb extended. */
function thumbsUpHand(): Vec3[] {
  const lm = closedFist();
  // Extend thumb: tip far from index MCP
  lm[3] = { x: 0.35, y: 0.50, z: 0 };
  lm[4] = { x: 0.28, y: 0.42, z: 0 };
  return lm;
}

// ---------------------------------------------------------------------------
// Vector helper tests
// ---------------------------------------------------------------------------

describe('distance', () => {
  it('should return 0 for identical points', () => {
    const p: Vec3 = { x: 1, y: 2, z: 3 };
    expect(distance(p, p)).toBe(0);
  });

  it('should compute Euclidean distance', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5);
  });

  it('should handle 3D distance', () => {
    expect(distance({ x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 })).toBeCloseTo(
      Math.sqrt(3),
    );
  });
});

describe('midpoint', () => {
  it('should return the midpoint of two points', () => {
    const m = midpoint({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 });
    expect(m).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('averagePoint', () => {
  it('should return the average of multiple points', () => {
    const avg = averagePoint([
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 4, z: 6 },
      { x: 4, y: 8, z: 12 },
    ]);
    expect(avg.x).toBeCloseTo(2);
    expect(avg.y).toBeCloseTo(4);
    expect(avg.z).toBeCloseTo(6);
  });

  it('should handle a single point', () => {
    const p: Vec3 = { x: 5, y: 10, z: 15 };
    expect(averagePoint([p])).toEqual(p);
  });

  it('should return {0,0,0} for empty array', () => {
    expect(averagePoint([])).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ---------------------------------------------------------------------------
// Finger extension
// ---------------------------------------------------------------------------

describe('isFingerExtended', () => {
  it('should detect all fingers as extended in an open hand', () => {
    const lm = openHand();
    const fingers: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (const f of fingers) {
      expect(isFingerExtended(f, lm)).toBe(true);
    }
  });

  it('should detect all fingers as curled in a fist', () => {
    const lm = closedFist();
    const fingers: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (const f of fingers) {
      expect(isFingerExtended(f, lm)).toBe(false);
    }
  });

  it('should detect only index as extended in a pointing hand', () => {
    const lm = pointingHand();
    expect(isFingerExtended('index', lm)).toBe(true);
    expect(isFingerExtended('middle', lm)).toBe(false);
    expect(isFingerExtended('ring', lm)).toBe(false);
    expect(isFingerExtended('pinky', lm)).toBe(false);
  });

  it('should return false for too-few landmarks', () => {
    expect(isFingerExtended('index', [])).toBe(false);
    expect(isFingerExtended('index', Array(10).fill({ x: 0, y: 0, z: 0 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gesture detection
// ---------------------------------------------------------------------------

describe('detectGestures', () => {
  it('should detect "spread" for an open hand', () => {
    expect(detectGestures(openHand())).toContain('spread');
  });

  it('should detect "fist" for a closed hand', () => {
    expect(detectGestures(closedFist())).toContain('fist');
  });

  it('should detect "point" for a pointing hand', () => {
    expect(detectGestures(pointingHand())).toContain('point');
  });

  it('should detect "pinch" when thumb and index tips are close', () => {
    expect(detectGestures(pinchHand())).toContain('pinch');
  });

  it('should detect "peace" for index+middle extended', () => {
    expect(detectGestures(peaceHand())).toContain('peace');
  });

  it('should detect "thumbsUp" for only thumb extended', () => {
    expect(detectGestures(thumbsUpHand())).toContain('thumbsUp');
  });

  it('should return ["none"] for insufficient landmarks', () => {
    expect(detectGestures([])).toEqual(['none']);
    expect(detectGestures([{ x: 0, y: 0, z: 0 }])).toEqual(['none']);
  });

  it('should return a gesture array for neutral poses', () => {
    // A neutral hand with all points at the same location
    const lm = neutralHand();
    const result = detectGestures(lm);
    // All-zero landmarks may match fist/pinch since distances are 0
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Palm center
// ---------------------------------------------------------------------------

describe('computePalmCenter', () => {
  it('should compute the average of wrist + 4 MCP joints', () => {
    const lm = openHand();
    const palm = computePalmCenter(lm);
    const expectedX =
      (lm[WRIST].x + lm[INDEX_MCP].x + lm[MIDDLE_MCP].x + lm[RING_MCP].x + lm[PINKY_MCP].x) / 5;
    const expectedY =
      (lm[WRIST].y + lm[INDEX_MCP].y + lm[MIDDLE_MCP].y + lm[RING_MCP].y + lm[PINKY_MCP].y) / 5;
    expect(palm.x).toBeCloseTo(expectedX);
    expect(palm.y).toBeCloseTo(expectedY);
  });

  it('should return {0,0,0} for too few landmarks', () => {
    expect(computePalmCenter([])).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ---------------------------------------------------------------------------
// buildHandLandmarks
// ---------------------------------------------------------------------------

describe('buildHandLandmarks', () => {
  it('should produce a complete HandLandmarks from an open hand', () => {
    const lm = openHand();
    const result = buildHandLandmarks(lm, 'Right');

    expect(result.handedness).toBe('Right');
    expect(result.rawLandmarks).toBe(lm);
    expect(result.gestures).toContain('spread');
    expect(result.fingers.thumb.isExtended).toBe(true);
    expect(result.fingers.index.isExtended).toBe(true);
    expect(result.fingers.middle.isExtended).toBe(true);
    expect(result.fingers.ring.isExtended).toBe(true);
    expect(result.fingers.pinky.isExtended).toBe(true);
  });

  it('should produce HandLandmarks from a fist', () => {
    const lm = closedFist();
    const result = buildHandLandmarks(lm, 'Left');

    expect(result.handedness).toBe('Left');
    expect(result.gestures).toContain('fist');
    expect(result.fingers.thumb.isExtended).toBe(false);
    expect(result.fingers.index.isExtended).toBe(false);
  });

  it('should set finger positions from tip landmarks', () => {
    const lm = openHand();
    const result = buildHandLandmarks(lm, 'Right');
    expect(result.fingers.index.position).toEqual(lm[INDEX_TIP]);
    expect(result.fingers.thumb.position).toEqual(lm[THUMB_TIP]);
  });

  it('should include a palmCenter', () => {
    const lm = openHand();
    const result = buildHandLandmarks(lm, 'Right');
    expect(result.palmCenter.x).toBeGreaterThan(0);
    expect(result.palmCenter.y).toBeGreaterThan(0);
  });
});
