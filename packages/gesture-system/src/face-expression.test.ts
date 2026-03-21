import { describe, it, expect } from 'vitest';
import {
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
} from './face-expression.js';
import type { Vec3 } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create 468 default face landmarks. */
function defaultFace(): Vec3[] {
  return Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
}

/**
 * Create a face with mouth wide open by placing upper lip high and lower
 * lip low, with mouth corners at a normal distance.
 */
function mouthOpenFace(): Vec3[] {
  const lm = defaultFace();
  // Upper lip (13) up, lower lip (14) down
  lm[13] = { x: 0.5, y: 0.45, z: 0 };
  lm[14] = { x: 0.5, y: 0.60, z: 0 };
  // Mouth corners (61, 291)
  lm[61] = { x: 0.40, y: 0.52, z: 0 };
  lm[291] = { x: 0.60, y: 0.52, z: 0 };
  // Cheeks for face width reference
  lm[234] = { x: 0.2, y: 0.5, z: 0 };
  lm[454] = { x: 0.8, y: 0.5, z: 0 };
  return lm;
}

/** Face with mouth closed (lips together). */
function mouthClosedFace(): Vec3[] {
  const lm = defaultFace();
  lm[13] = { x: 0.5, y: 0.52, z: 0 };
  lm[14] = { x: 0.5, y: 0.53, z: 0 };
  lm[61] = { x: 0.40, y: 0.52, z: 0 };
  lm[291] = { x: 0.60, y: 0.52, z: 0 };
  lm[234] = { x: 0.2, y: 0.5, z: 0 };
  lm[454] = { x: 0.8, y: 0.5, z: 0 };
  return lm;
}

/** Smiling face: wide mouth relative to face width. */
function smilingFace(): Vec3[] {
  const lm = defaultFace();
  lm[61] = { x: 0.30, y: 0.52, z: 0 };
  lm[291] = { x: 0.70, y: 0.52, z: 0 };
  lm[234] = { x: 0.15, y: 0.5, z: 0 };
  lm[454] = { x: 0.85, y: 0.5, z: 0 };
  return lm;
}

/** Puckered face: narrow mouth relative to face width. */
function puckeredFace(): Vec3[] {
  const lm = defaultFace();
  lm[61] = { x: 0.47, y: 0.52, z: 0 };
  lm[291] = { x: 0.53, y: 0.52, z: 0 };
  lm[234] = { x: 0.15, y: 0.5, z: 0 };
  lm[454] = { x: 0.85, y: 0.5, z: 0 };
  return lm;
}

/** Face with left eye closed. */
function leftEyeClosedFace(): Vec3[] {
  const lm = defaultFace();
  // Left eye: upper lid (159) and lower lid (145) very close
  lm[159] = { x: 0.38, y: 0.42, z: 0 };
  lm[145] = { x: 0.38, y: 0.425, z: 0 }; // nearly touching
  // Cheeks for reference
  lm[234] = { x: 0.15, y: 0.5, z: 0 };
  lm[454] = { x: 0.85, y: 0.5, z: 0 };
  return lm;
}

/** Face with right eye closed. */
function rightEyeClosedFace(): Vec3[] {
  const lm = defaultFace();
  lm[386] = { x: 0.62, y: 0.42, z: 0 };
  lm[374] = { x: 0.62, y: 0.425, z: 0 };
  lm[234] = { x: 0.15, y: 0.5, z: 0 };
  lm[454] = { x: 0.85, y: 0.5, z: 0 };
  return lm;
}

/** Face with raised left eyebrow. */
function leftEyebrowRaisedFace(): Vec3[] {
  const lm = defaultFace();
  lm[105] = { x: 0.38, y: 0.28, z: 0 }; // eyebrow top (high)
  lm[159] = { x: 0.38, y: 0.40, z: 0 }; // eye top (reference)
  lm[234] = { x: 0.15, y: 0.5, z: 0 };
  lm[454] = { x: 0.85, y: 0.5, z: 0 };
  return lm;
}

/** Face with jaw open. */
function jawOpenFace(): Vec3[] {
  const lm = defaultFace();
  lm[1]   = { x: 0.5, y: 0.50, z: 0 };  // nose tip
  lm[152] = { x: 0.5, y: 0.95, z: 0 };  // jaw (chin) — far down
  lm[234] = { x: 0.15, y: 0.5, z: 0 };
  lm[454] = { x: 0.85, y: 0.5, z: 0 };
  return lm;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreMouthOpen', () => {
  it('should return high score for open mouth', () => {
    expect(scoreMouthOpen(mouthOpenFace())).toBeGreaterThan(0.5);
  });

  it('should return low score for closed mouth', () => {
    expect(scoreMouthOpen(mouthClosedFace())).toBeLessThan(0.2);
  });

  it('should return 0 for too-few landmarks', () => {
    expect(scoreMouthOpen([])).toBe(0);
  });
});

describe('scoreMouthSmile', () => {
  it('should return high score for a wide smile', () => {
    expect(scoreMouthSmile(smilingFace())).toBeGreaterThan(0.4);
  });

  it('should return low/zero score for a pucker', () => {
    expect(scoreMouthSmile(puckeredFace())).toBeLessThan(0.1);
  });
});

describe('scoreMouthPucker', () => {
  it('should return high score for pursed lips', () => {
    expect(scoreMouthPucker(puckeredFace())).toBeGreaterThan(0.5);
  });

  it('should return low score for wide mouth', () => {
    expect(scoreMouthPucker(smilingFace())).toBe(0);
  });
});

describe('scoreEyeBlinkLeft', () => {
  it('should return high score when left eye is closed', () => {
    expect(scoreEyeBlinkLeft(leftEyeClosedFace())).toBeGreaterThan(0.5);
  });

  it('should return 0 for too-few landmarks', () => {
    expect(scoreEyeBlinkLeft([])).toBe(0);
  });
});

describe('scoreEyeBlinkRight', () => {
  it('should return high score when right eye is closed', () => {
    expect(scoreEyeBlinkRight(rightEyeClosedFace())).toBeGreaterThan(0.5);
  });
});

describe('scoreEyebrowRaiseLeft', () => {
  it('should return high score when left eyebrow is raised', () => {
    expect(scoreEyebrowRaiseLeft(leftEyebrowRaisedFace())).toBeGreaterThan(0.3);
  });
});

describe('scoreEyebrowRaiseRight', () => {
  it('should return 0 for insufficient landmarks', () => {
    expect(scoreEyebrowRaiseRight([])).toBe(0);
  });
});

describe('scoreJawOpen', () => {
  it('should return high score for jaw open', () => {
    expect(scoreJawOpen(jawOpenFace())).toBeGreaterThan(0.3);
  });

  it('should return 0 for too-few landmarks', () => {
    expect(scoreJawOpen([])).toBe(0);
  });
});

describe('scoreCheekPuff', () => {
  it('should return 0 for too-few landmarks', () => {
    expect(scoreCheekPuff([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildFaceLandmarks
// ---------------------------------------------------------------------------

describe('buildFaceLandmarks', () => {
  it('should produce a FaceLandmarks with all expression keys', () => {
    const lm = mouthOpenFace();
    const result = buildFaceLandmarks(lm);

    const expectedKeys = [
      'mouthOpen',
      'mouthSmile',
      'mouthPucker',
      'eyeBlinkLeft',
      'eyeBlinkRight',
      'eyebrowRaiseLeft',
      'eyebrowRaiseRight',
      'jawOpen',
      'cheekPuff',
    ];
    for (const key of expectedKeys) {
      expect(result.expressions).toHaveProperty(key);
      expect(typeof result.expressions[key as keyof typeof result.expressions]).toBe('number');
    }
  });

  it('should include rawLandmarks', () => {
    const lm = defaultFace();
    const result = buildFaceLandmarks(lm);
    expect(result.rawLandmarks).toBe(lm);
    expect(result.rawLandmarks).toHaveLength(468);
  });

  it('should score mouthOpen > 0.5 for an open mouth', () => {
    const result = buildFaceLandmarks(mouthOpenFace());
    expect(result.expressions.mouthOpen).toBeGreaterThan(0.5);
  });

  it('should return all scores as 0 for empty landmarks', () => {
    const result = buildFaceLandmarks([]);
    for (const val of Object.values(result.expressions)) {
      expect(val).toBe(0);
    }
  });

  it('should clamp all scores between 0 and 1', () => {
    // Use various face configurations
    const faces = [mouthOpenFace(), smilingFace(), puckeredFace(), jawOpenFace()];
    for (const face of faces) {
      const result = buildFaceLandmarks(face);
      for (const val of Object.values(result.expressions)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });
});
