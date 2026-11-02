import { describe, it, expect } from 'vitest';
import { calibrateCosineSimilarity, evaluateBiometricMatch } from '../src/vectorMath';

describe('Biometric Cosine Similarity Calibration Curve', () => {
  it('maps raw cosine >= 0.48 to >= 85% similarity (genuine patient range)', () => {
    // 0.48 threshold
    const at48 = calibrateCosineSimilarity(0.48);
    expect(at48).toBeGreaterThanOrEqual(0.85);
    expect(Math.round(at48 * 100)).toBe(85);

    // 0.52 (live test scenario: คุณ พัทดนย์ ผ่องอารมย์)
    const at52 = calibrateCosineSimilarity(0.52);
    expect(at52).toBeGreaterThanOrEqual(0.86);
    expect(Math.round(at52 * 100)).toBeGreaterThanOrEqual(86);

    // High cosine 0.70
    const at70 = calibrateCosineSimilarity(0.70);
    expect(at70).toBeGreaterThanOrEqual(0.91);
    expect(Math.round(at70 * 100)).toBeGreaterThanOrEqual(91);

    // Near 1.0
    const at95 = calibrateCosineSimilarity(0.95);
    expect(at95).toBeGreaterThanOrEqual(0.98);
  });

  it('maps raw cosine in [0.38, 0.48) to [45%, 80%) (ambiguous candidate zone)', () => {
    const at38 = calibrateCosineSimilarity(0.38);
    expect(Math.round(at38 * 100)).toBe(45);

    const at40 = calibrateCosineSimilarity(0.40);
    expect(Math.round(at40 * 100)).toBeGreaterThanOrEqual(50);
    expect(Math.round(at40 * 100)).toBeLessThan(80);

    const at47 = calibrateCosineSimilarity(0.47);
    expect(Math.round(at47 * 100)).toBeLessThan(80);
  });

  it('strictly rejects impostor vectors with raw cosine < 0.38 (< 45%)', () => {
    const at37 = calibrateCosineSimilarity(0.37);
    expect(Math.round(at37 * 100)).toBeLessThan(45);

    const at20 = calibrateCosineSimilarity(0.20);
    expect(Math.round(at20 * 100)).toBeLessThan(25);

    const at0 = calibrateCosineSimilarity(0.0);
    expect(at0).toBe(0.0);
  });

  it('evaluateBiometricMatch with useCalibration=true grants match for rawCos >= 0.48 and rejects < 0.38', () => {
    const probe = new Array(512).fill(0);
    const ref = new Array(512).fill(0);

    // Scenario 1: rawCos = 0.52 (52% raw score) -> Calibrated is ~84% -> isMatch: true
    probe[0] = 1.0;
    ref[0] = 0.52;
    ref[1] = Math.sqrt(1 - 0.52 * 0.52);

    const match52 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match52.rawCosineSimilarity).toBe(0.52);
    expect(match52.similarityPercentage).toBeGreaterThanOrEqual(80);
    expect(match52.isMatch).toBe(true);

    // Scenario 2: rawCos = 0.35 (impostor) -> Calibrated is ~41% -> isMatch: false
    ref[0] = 0.35;
    ref[1] = Math.sqrt(1 - 0.35 * 0.35);

    const match35 = evaluateBiometricMatch(probe, ref, { useCalibration: true });
    expect(match35.rawCosineSimilarity).toBe(0.35);
    expect(match35.similarityPercentage).toBeLessThan(45);
    expect(match35.isMatch).toBe(false);
  });
});

