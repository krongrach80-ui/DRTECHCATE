import { describe, it, expect } from 'vitest';
import { calibrateCosineSimilarity, evaluateBiometricMatch } from '../src/vectorMath';

describe('Biometric Cosine Similarity Calibration Curve', () => {
  it('maps raw cosine >= 0.85 to >= 85% similarity (genuine patient range)', () => {
    // 0.85 threshold -> 85%
    const at85 = calibrateCosineSimilarity(0.85);
    expect(at85).toBeGreaterThanOrEqual(0.85);
    expect(Math.round(at85 * 100)).toBe(85);

    // 0.90
    const at90 = calibrateCosineSimilarity(0.90);
    expect(at90).toBeGreaterThanOrEqual(0.90);
    expect(Math.round(at90 * 100)).toBe(90);

    // Near 1.0
    const at95 = calibrateCosineSimilarity(0.95);
    expect(at95).toBeGreaterThanOrEqual(0.95);
    expect(Math.round(at95 * 100)).toBe(95);
  });

  it('maps raw cosine in [0.70, 0.85) to [50%, 80%) (ambiguous candidate zone)', () => {
    const at70 = calibrateCosineSimilarity(0.70);
    expect(Math.round(at70 * 100)).toBe(50);

    const at76 = calibrateCosineSimilarity(0.76);
    expect(Math.round(at76 * 100)).toBeGreaterThanOrEqual(50);
    expect(Math.round(at76 * 100)).toBeLessThan(80);

    const at84 = calibrateCosineSimilarity(0.84);
    expect(Math.round(at84 * 100)).toBeLessThan(80);
  });

  it('strictly rejects impostor vectors with raw cosine < 0.70 (< 45%)', () => {
    const at69 = calibrateCosineSimilarity(0.69);
    expect(Math.round(at69 * 100)).toBeLessThanOrEqual(45);

    const at50 = calibrateCosineSimilarity(0.50);
    expect(Math.round(at50 * 100)).toBeLessThan(35);

    const at35 = calibrateCosineSimilarity(0.35);
    expect(Math.round(at35 * 100)).toBeLessThan(25);

    const at0 = calibrateCosineSimilarity(0.0);
    expect(at0).toBe(0.0);
  });

  it('evaluateBiometricMatch grants match for rawCos >= 0.85 and rejects < 0.85', () => {
    const probe = new Array(512).fill(0);
    const ref = new Array(512).fill(0);

    // Scenario 1: rawCos = 0.94 (genuine match, dist = 0.346 <= 0.38) -> Calibrated is 94% -> isMatch: true
    probe[0] = 1.0;
    ref[0] = 0.94;
    ref[1] = Math.sqrt(1 - 0.94 * 0.94);

    const match94 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match94.rawCosineSimilarity).toBe(0.94);
    expect(match94.similarityPercentage).toBeGreaterThanOrEqual(85);
    expect(match94.isMatch).toBe(true);

    // Scenario 2: rawCos = 0.76 (ambiguous candidate zone) -> Calibrated is ~62% -> isMatch: false
    ref[0] = 0.76;
    ref[1] = Math.sqrt(1 - 0.76 * 0.76);

    const match76 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match76.rawCosineSimilarity).toBe(0.76);
    expect(match76.similarityPercentage).toBeGreaterThanOrEqual(50);
    expect(match76.similarityPercentage).toBeLessThan(80);
    expect(match76.isMatch).toBe(false);

    // Scenario 3: rawCos = 0.50 (impostor stranger) -> Calibrated is < 45% -> isMatch: false
    ref[0] = 0.50;
    ref[1] = Math.sqrt(1 - 0.50 * 0.50);

    const match50 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match50.rawCosineSimilarity).toBe(0.50);
    expect(match50.similarityPercentage).toBeLessThan(45);
    expect(match50.isMatch).toBe(false);
  });
});

