/**
 * packages/clinical-analytics/src/__tests__/e2e_clinical_inspection.test.ts
 *
 * END-TO-END CLINICAL INSPECTION & TELEMETRY VERIFICATION PIPELINE
 *
 * Validates:
 * 1. 3D Kinematic Telemetry Synthesis (300 frames, 10s @ 30 FPS, Jerk Spike > 850°/s³, Culprit Joint)
 * 2. Longitudinal Recovery Trajectory Math (OLS Regression R² > 0.92, JSSI, Forecasting)
 * 3. Hospital-Grade Medical Rehabilitation Report (LOINC 80317-1, ICD-10 M75.1, Print Stylesheet)
 */

import { describe, it, expect } from 'vitest';
import {
  synthesizeClinicalPainReplaySnapshot,
  detectBiomechanicalAnomalies,
} from '../../../kinematic-replay-3d/src/index';
import {
  synthesizeLongitudinalRecoveryProfile,
  analyzeRecoveryTrajectory,
  generateClinicalReport,
  generatePrintableHtml,
} from '../index';

describe('[E2E CLINICAL INSPECTION] 3D Holographic Telemetry & Clinical Analytics Pipeline', () => {
  it('E2E-1: Synthesizes 300-frame kinematic snapshot and accurately detects jerk spike at Frame 210', () => {
    const snapshot = synthesizeClinicalPainReplaySnapshot({
      patientId: 'HN-90821',
      exerciseName: 'Shoulder Abduction (กางข้อไหล่)',
    });

    expect(snapshot.totalFrames).toBe(300);
    expect(snapshot.fps).toBe(30);
    expect(snapshot.hasPainEvent).toBe(true);
    expect(snapshot.frames.length).toBe(300);

    // Frame 1 to 190: Smooth motion, trunk tilt < 4°
    for (let i = 0; i < 190; i++) {
      const f = snapshot.frames[i];
      expect(f.trunkLateralTiltDeg).toBeLessThan(4.0);
      expect(f.isPainEvent).toBe(false);
    }

    // Frame 210: Critical pain event
    const criticalFrame = snapshot.frames[210];
    expect(criticalFrame.isPainEvent).toBe(true);
    expect(criticalFrame.angularVelocityDegPerSec).toBeGreaterThanOrEqual(180);
    expect(criticalFrame.trunkLateralTiltDeg).toBeGreaterThan(12.0); // 18.5°

    // Run Biomechanical Anomaly Detector
    const anomaly = detectBiomechanicalAnomalies(snapshot);

    expect(anomaly.hasAnomaly).toBe(true);
    expect(anomaly.peakJerkFrameIndex).toBeGreaterThanOrEqual(208);
    expect(anomaly.peakJerkFrameIndex).toBeLessThanOrEqual(212);
    expect(anomaly.peakJerkValueDegPerSec3).toBeGreaterThan(850);
    expect(anomaly.culpritSide).toBe('left');
    expect(anomaly.culpritJoint).toBe('left_shoulder_complex');
    expect(anomaly.anomalyTimestamps.length).toBeGreaterThan(0);
  });

  it('E2E-2: Synthesizes 12-session longitudinal recovery trajectory with R² > 0.92 and positive OLS slope', () => {
    const profile = synthesizeLongitudinalRecoveryProfile({
      patientId: 'HN-89021',
      patientName: 'นายวิชาญ ธนพัฒน์พิริยะ',
      targetRomDeg: 160,
    });

    expect(profile.sessions.length).toBe(12);
    expect(profile.patientProfile.icd10Code).toContain('M75.1');
    expect(profile.patientProfile.loincCode).toContain('80317-1');

    // Run Trajectory Analysis
    const result = analyzeRecoveryTrajectory(profile.sessions);

    // Slope must be positive (rehabilitation progress)
    expect(result.slopeDegPerDay).toBeGreaterThan(1.5);
    // Linear regression fit R² > 0.92
    expect(result.rSquared).toBeGreaterThan(0.92);
    // Target and baseline checks
    expect(result.baselineRomDeg).toBe(62);
    expect(result.currentRomDeg).toBe(138);
    expect(result.targetRomDeg).toBe(160);
    expect(result.percentRecovery).toBeGreaterThan(70);

    // Joint Stability & Smoothness Index (0 - 100)
    expect(result.jointStabilityIndex).toBeGreaterThan(0);
    expect(result.jointStabilityIndex).toBeLessThanOrEqual(100);

    // Forecasting date
    expect(result.daysToFullRecovery).not.toBeNull();
    expect(result.daysToFullRecovery!).toBeGreaterThan(0);
    expect(result.estimatedFullRecoveryDate).not.toBeNull();

    // Session 4 must have pain reported
    expect(profile.sessions[3].painReported).toBe(true);
  });

  it('E2E-3: Generates hospital-grade clinical report HTML containing LOINC 80317-1 and ICD-10 M75.1', () => {
    const profile = synthesizeLongitudinalRecoveryProfile();
    const painEvents = [
      {
        dateIso: profile.sessions[3].dateIso,
        exerciseName: 'Shoulder Abduction (กางข้อไหล่)',
        angleAtPainDeg: profile.sessions[3].maxRomDeg,
        descriptionTh: 'ตรวจพบอาการสะดุดและแรงกระชากของข้อต่อหัวไหล่ซ้าย',
      },
    ];

    const report = generateClinicalReport(
      profile.patientProfile,
      profile.trajectory,
      painEvents,
      'ผู้ป่วยมีพัฒนาการกางข้อไหล่ดีขึ้นอย่างต่อเนื่อง อาการชดเชยท่ายกลอยของกระดูกสะบักลดลงสู่ระดับปกติ'
    );

    expect(report.reportId).toContain('HN-89021');
    expect(report.patient.hn).toBe('HN-89021');
    expect(report.electronicSignature.isVerified).toBe(true);

    const html = generatePrintableHtml(report);

    // Verification of clinical coding standards & print stylesheets
    expect(html).toContain('80317-1');
    expect(html).toContain('M75.1');
    expect(html).toContain('นายวิชาญ ธนพัฒน์พิริยะ');
    expect(html).toContain('@media print');
    expect(html).toContain('160°');
    expect(html).toContain('กภ. สุภาพร ชีวเวช');
    expect(html).toContain('PT-10245');
  });
});
