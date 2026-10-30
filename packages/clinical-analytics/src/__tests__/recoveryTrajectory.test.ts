/**
 * packages/clinical-analytics/src/__tests__/recoveryTrajectory.test.ts
 *
 * Unit tests for Longitudinal Recovery Trajectory Analyzer & Report Generator
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeRecoveryTrajectory,
  HistoricalSessionMetric,
} from '../recoveryTrajectory';
import {
  generateClinicalReport,
  generatePrintableHtml,
  PatientClinicalProfile,
} from '../clinicalReportGenerator';

describe('Longitudinal Recovery Trajectory Analyzer', () => {
  it('1. calculates exact linear regression slope and R² on ascending ROM trajectory', () => {
    // 3 sessions: Day 0: 30°, Day 5: 45°, Day 10: 60° (Slope = 3.0°/day, Intercept = 30°)
    const metrics: HistoricalSessionMetric[] = [
      {
        sessionId: 's-1',
        dateIso: '2026-10-01T08:00:00.000Z',
        dayIndex: 0,
        maxRomDeg: 30,
        targetRomDeg: 120,
        formQualityScore: 80,
        angularVelocityVariance: 5,
        scapularHikingRate: 0.1,
        trunkTiltDeg: 2,
        painReported: false,
      },
      {
        sessionId: 's-2',
        dateIso: '2026-10-06T08:00:00.000Z',
        dayIndex: 5,
        maxRomDeg: 45,
        targetRomDeg: 120,
        formQualityScore: 85,
        angularVelocityVariance: 4,
        scapularHikingRate: 0.08,
        trunkTiltDeg: 2,
        painReported: false,
      },
      {
        sessionId: 's-3',
        dateIso: '2026-10-11T08:00:00.000Z',
        dayIndex: 10,
        maxRomDeg: 60,
        targetRomDeg: 120,
        formQualityScore: 90,
        angularVelocityVariance: 3,
        scapularHikingRate: 0.05,
        trunkTiltDeg: 1,
        painReported: false,
      },
    ];

    const result = analyzeRecoveryTrajectory(metrics);

    expect(result.slopeDegPerDay).toBeCloseTo(3.0, 1);
    expect(result.interceptRomDeg).toBeCloseTo(30.0, 1);
    expect(result.rSquared).toBeCloseTo(1.0, 2);
    expect(result.trajectoryStatus).toBe('accelerating');
    expect(result.percentRecovery).toBe(33); // (60 - 30) / (120 - 30) = 30/90 = 33.3%
  });

  it('2. forecasts days to full recovery and estimated recovery date accurately', () => {
    // Current ROM is 60°, target is 120° (needs 60°).
    // Slope = 2.0°/day -> daysRemaining = 30 days.
    const metrics: HistoricalSessionMetric[] = [
      {
        sessionId: 's-1',
        dateIso: '2026-10-01T08:00:00.000Z',
        dayIndex: 0,
        maxRomDeg: 40,
        targetRomDeg: 120,
        formQualityScore: 80,
        painReported: false,
      },
      {
        sessionId: 's-2',
        dateIso: '2026-10-10T08:00:00.000Z',
        dayIndex: 10,
        maxRomDeg: 60,
        targetRomDeg: 120,
        formQualityScore: 85,
        painReported: false,
      },
    ];

    const result = analyzeRecoveryTrajectory(metrics);

    expect(result.slopeDegPerDay).toBeCloseTo(2.0, 1);
    expect(result.daysToFullRecovery).toBe(30);
    // 2026-10-10 + 30 days = 2026-11-09
    expect(result.estimatedFullRecoveryDate).toBe('2026-11-09');
  });

  it('3. identifies plateau condition when slope is near zero (m <= 0.1)', () => {
    const plateauMetrics: HistoricalSessionMetric[] = [
      {
        sessionId: 's-1',
        dateIso: '2026-10-01T08:00:00.000Z',
        dayIndex: 0,
        maxRomDeg: 75,
        targetRomDeg: 120,
        formQualityScore: 80,
        painReported: false,
      },
      {
        sessionId: 's-2',
        dateIso: '2026-10-05T08:00:00.000Z',
        dayIndex: 4,
        maxRomDeg: 75,
        targetRomDeg: 120,
        formQualityScore: 80,
        painReported: false,
      },
      {
        sessionId: 's-3',
        dateIso: '2026-10-10T08:00:00.000Z',
        dayIndex: 9,
        maxRomDeg: 75,
        targetRomDeg: 120,
        formQualityScore: 80,
        painReported: false,
      },
    ];

    const result = analyzeRecoveryTrajectory(plateauMetrics);
    expect(result.slopeDegPerDay).toBe(0);
    expect(result.trajectoryStatus).toBe('plateau_monitored');
    expect(result.clinicalSummaryTh).toContain('Plateau');
    expect(result.estimatedFullRecoveryDate).toBeNull();
  });

  it('4. computes Joint Stability & Smoothness Index (JSSI) between 0 and 100', () => {
    const smoothMetrics: HistoricalSessionMetric[] = [
      {
        sessionId: 's-1',
        dateIso: '2026-10-01T08:00:00.000Z',
        dayIndex: 0,
        maxRomDeg: 50,
        targetRomDeg: 120,
        formQualityScore: 95,
        angularVelocityVariance: 2.0, // Low variance
        scapularHikingRate: 0.02, // Minimal compensation
        trunkTiltDeg: 1.0,
        painReported: false,
      },
    ];

    const result = analyzeRecoveryTrajectory(smoothMetrics);
    expect(result.jointStabilityIndex).toBeGreaterThanOrEqual(80);
    expect(result.jointStabilityIndex).toBeLessThanOrEqual(100);
  });
});

describe('Clinical Report Generator & Print Engine', () => {
  const patientProfile: PatientClinicalProfile = {
    hn: 'HN-99882',
    fullName: 'คุณสมชาย ฟื้นฟูดี',
    age: 54,
    gender: 'ชาย',
    targetJoint: 'ไหล่ขวา',
    diagnosis: 'Rotator Cuff Tendinopathy (ขวา)',
    icd10Code: 'M75.1',
    loincCode: '72274-4',
    attendingPtName: 'กภ. สุภาพร ชีวเวช (วภ. 10245)',
    attendingPtLicense: 'PT-10245',
  };

  it('1. generates complete clinical report structure with electronic sign-off', () => {
    const trajectory = analyzeRecoveryTrajectory([
      {
        sessionId: 's-1',
        dateIso: '2026-10-01T08:00:00.000Z',
        dayIndex: 0,
        maxRomDeg: 40,
        targetRomDeg: 120,
        formQualityScore: 85,
        painReported: false,
      },
    ]);

    const report = generateClinicalReport(patientProfile, trajectory, [
      {
        dateIso: '2026-10-01T08:30:00.000Z',
        exerciseName: 'Shoulder Pendulum',
        angleAtPainDeg: 42,
        descriptionTh: 'เจ็บบริเวณ Anterior Deltoid',
      },
    ]);

    expect(report.reportId).toContain('HN-99882');
    expect(report.patient.fullName).toBe('คุณสมชาย ฟื้นฟูดี');
    expect(report.patient.icd10Code).toContain('M75.1');
    expect(report.painEvents.length).toBe(1);
    expect(report.electronicSignature.signerName).toBe('กภ. สุภาพร ชีวเวช (วภ. 10245)');
    expect(report.electronicSignature.isVerified).toBe(true);
  });

  it('2. generates valid A4 print-ready HTML with @media print stylesheet', () => {
    const trajectory = analyzeRecoveryTrajectory([
      {
        sessionId: 's-1',
        dateIso: '2026-10-01T08:00:00.000Z',
        dayIndex: 0,
        maxRomDeg: 40,
        targetRomDeg: 120,
        formQualityScore: 85,
        painReported: false,
      },
    ]);

    const report = generateClinicalReport(patientProfile, trajectory);
    const html = generatePrintableHtml(report);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('คุณสมชาย ฟื้นฟูดี');
    expect(html).toContain('HN-99882');
    expect(html).toContain('ลงนามรับรองทางอิเล็กทรอนิกส์');
  });
});
