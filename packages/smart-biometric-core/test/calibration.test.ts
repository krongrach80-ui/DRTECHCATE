import { describe, it, expect } from 'vitest';
import { calibrateCosineSimilarity, evaluateBiometricMatch } from '../src/vectorMath';

describe('Biometric Cosine Similarity Calibration Curve', () => {
  it('maps raw cosine >= 0.55 to >= 80% similarity (genuine patient range)', () => {
    // 0.55 threshold -> 80%
    const at55 = calibrateCosineSimilarity(0.55);
    expect(at55).toBeGreaterThanOrEqual(0.80);
    expect(Math.round(at55 * 100)).toBe(80);

    // 0.60
    const at60 = calibrateCosineSimilarity(0.60);
    expect(at60).toBeGreaterThanOrEqual(0.82);
    expect(Math.round(at60 * 100)).toBeGreaterThanOrEqual(82);

    // High cosine 0.85
    const at85 = calibrateCosineSimilarity(0.85);
    expect(at85).toBeGreaterThanOrEqual(0.96);
    expect(Math.round(at85 * 100)).toBe(96);

    // Near 1.0
    const at95 = calibrateCosineSimilarity(0.95);
    expect(at95).toBeGreaterThanOrEqual(0.98);
  });

  it('maps raw cosine in [0.42, 0.55) to [50%, 80%) (ambiguous candidate zone)', () => {
    const at42 = calibrateCosineSimilarity(0.42);
    expect(Math.round(at42 * 100)).toBe(50);

    const at48 = calibrateCosineSimilarity(0.48);
    expect(Math.round(at48 * 100)).toBeGreaterThanOrEqual(50);
    expect(Math.round(at48 * 100)).toBeLessThan(80);

    const at54 = calibrateCosineSimilarity(0.54);
    expect(Math.round(at54 * 100)).toBeLessThan(80);
  });

  it('strictly rejects impostor vectors with raw cosine < 0.42 (< 50%)', () => {
    const at41 = calibrateCosineSimilarity(0.41);
    expect(Math.round(at41 * 100)).toBeLessThan(50);

    const at35 = calibrateCosineSimilarity(0.35);
    expect(Math.round(at35 * 100)).toBeLessThan(45);

    const at20 = calibrateCosineSimilarity(0.20);
    expect(Math.round(at20 * 100)).toBeLessThan(25);

    const at0 = calibrateCosineSimilarity(0.0);
    expect(at0).toBe(0.0);
  });

  it('evaluateBiometricMatch with useCalibration=true grants match for rawCos >= 0.55 and rejects < 0.55', () => {
    const probe = new Array(512).fill(0);
    const ref = new Array(512).fill(0);

    // Scenario 1: rawCos = 0.58 (genuine match) -> Calibrated is ~82% -> isMatch: true
    probe[0] = 1.0;
    ref[0] = 0.58;
    ref[1] = Math.sqrt(1 - 0.58 * 0.58);

    const match58 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match58.rawCosineSimilarity).toBe(0.58);
    expect(match58.similarityPercentage).toBeGreaterThanOrEqual(80);
    expect(match58.isMatch).toBe(true);

    // Scenario 2: rawCos = 0.48 (ambiguous candidate zone) -> Calibrated is ~63% -> isMatch: false
    ref[0] = 0.48;
    ref[1] = Math.sqrt(1 - 0.48 * 0.48);

    const match48 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match48.rawCosineSimilarity).toBe(0.48);
    expect(match48.similarityPercentage).toBeGreaterThanOrEqual(50);
    expect(match48.similarityPercentage).toBeLessThan(80);
    expect(match48.isMatch).toBe(false);

    // Scenario 3: rawCos = 0.35 (impostor stranger) -> Calibrated is < 50% -> isMatch: false
    ref[0] = 0.35;
    ref[1] = Math.sqrt(1 - 0.35 * 0.35);

    const match35 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match35.rawCosineSimilarity).toBe(0.35);
    expect(match35.similarityPercentage).toBeLessThan(50);
    expect(match35.isMatch).toBe(false);
  });
});

