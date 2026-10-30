/**
 * packages/clinical-analytics/src/recoveryTrajectory.ts
 *
 * MATHEMATICAL RECOVERY TRAJECTORY ANALYZER
 *
 * Evaluates patient longitudinal session history using:
 * 1. Ordinary Least Squares (OLS) Linear Regression: Computes trajectory slope (m) and R² goodness of fit.
 * 2. Joint Stability & Smoothness Index (JSSI): Measures kinematic consistency (0-100) from velocity variance.
 * 3. Clinical Target Date Forecasting: Statistically predicts estimatedFullRecoveryDate.
 */

export interface HistoricalSessionMetric {
  sessionId: string;
  dateIso: string;
  dayIndex: number; // e.g. Day 0, Day 3, Day 7...
  maxRomDeg: number;
  targetRomDeg: number;
  formQualityScore: number; // 0 to 100
  angularVelocityVariance?: number;
  scapularHikingRate?: number; // 0 to 1
  trunkTiltDeg?: number;
  painReported: boolean;
}

export interface TrajectoryAnalysisResult {
  slopeDegPerDay: number;
  interceptRomDeg: number;
  rSquared: number;
  currentRomDeg: number;
  targetRomDeg: number;
  baselineRomDeg: number;
  percentRecovery: number;
  jointStabilityIndex: number; // JSSI: 0 - 100
  estimatedFullRecoveryDate: string | null;
  daysToFullRecovery: number | null;
  trajectoryStatus: 'accelerating' | 'steady_progress' | 'plateau_monitored' | 'regressing';
  clinicalSummaryTh: string;
}

/**
 * Analyzes patient recovery trajectory from session time-series
 */
export function analyzeRecoveryTrajectory(
  metrics: HistoricalSessionMetric[]
): TrajectoryAnalysisResult {
  if (!metrics || metrics.length === 0) {
    return {
      slopeDegPerDay: 0,
      interceptRomDeg: 0,
      rSquared: 0,
      currentRomDeg: 0,
      targetRomDeg: 120,
      baselineRomDeg: 0,
      percentRecovery: 0,
      jointStabilityIndex: 100,
      estimatedFullRecoveryDate: null,
      daysToFullRecovery: null,
      trajectoryStatus: 'steady_progress',
      clinicalSummaryTh: 'ยังไม่มีประวัติการฝึกสำหรับวิเคราะห์แนวโน้ม',
    };
  }

  // Sort chronologically by dayIndex / date
  const sorted = [...metrics].sort((a, b) => a.dayIndex - b.dayIndex);
  const n = sorted.length;

  const baselineRomDeg = sorted[0].maxRomDeg;
  const currentRomDeg = sorted[n - 1].maxRomDeg;
  const targetRomDeg = sorted[n - 1].targetRomDeg || 120;

  // Single-session edge case
  if (n === 1) {
    const pct = Math.min(
      100,
      Math.max(0, Math.round(((currentRomDeg - baselineRomDeg) / Math.max(1, targetRomDeg - baselineRomDeg)) * 100))
    );
    return {
      slopeDegPerDay: 0,
      interceptRomDeg: currentRomDeg,
      rSquared: 1.0,
      currentRomDeg,
      targetRomDeg,
      baselineRomDeg,
      percentRecovery: pct,
      jointStabilityIndex: 85,
      estimatedFullRecoveryDate: null,
      daysToFullRecovery: null,
      trajectoryStatus: 'steady_progress',
      clinicalSummaryTh: `บันทึกข้อมูลเซสชันแรก: องศาปัจจุบัน ${currentRomDeg}° จากเป้าหมาย ${targetRomDeg}°`,
    };
  }

  // OLS Linear Regression: y = mx + b
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const x = sorted[i].dayIndex;
    const y = sorted[i].maxRomDeg;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  // Pearson Correlation Coefficient r and R²
  const rDenom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  const r = rDenom !== 0 ? (n * sumXY - sumX * sumY) / rDenom : 0;
  const rSquared = Math.min(1.0, Math.max(0.0, Math.round(r * r * 100) / 100));

  // Joint Stability & Smoothness Index (JSSI: 0 to 100)
  let totalVelVariance = 0;
  let totalHiking = 0;
  let totalTrunkTilt = 0;

  for (const m of sorted) {
    totalVelVariance += m.angularVelocityVariance ?? 10;
    totalHiking += m.scapularHikingRate ?? 0.1;
    totalTrunkTilt += m.trunkTiltDeg ?? 3;
  }

  const avgVelVariance = totalVelVariance / n;
  const avgHiking = totalHiking / n;
  const avgTrunkTilt = totalTrunkTilt / n;

  const rawJssi = 100 - (avgVelVariance * 0.15 + avgHiking * 25 + avgTrunkTilt * 1.1);
  const jointStabilityIndex = Math.max(0, Math.min(100, Math.round(rawJssi)));

  // Percent recovery achieved
  const romDeltaTotal = targetRomDeg - baselineRomDeg;
  const romDeltaAchieved = currentRomDeg - baselineRomDeg;
  const percentRecovery =
    romDeltaTotal > 0
      ? Math.min(100, Math.max(0, Math.round((romDeltaAchieved / romDeltaTotal) * 100)))
      : 100;

  // Forecast Days to Full Recovery
  let daysToFullRecovery: number | null = null;
  let estimatedFullRecoveryDate: string | null = null;
  let trajectoryStatus: 'accelerating' | 'steady_progress' | 'plateau_monitored' | 'regressing' =
    'steady_progress';

  if (slope < -0.1) {
    trajectoryStatus = 'regressing';
  } else if (slope <= 0.1) {
    trajectoryStatus = 'plateau_monitored';
  } else if (slope >= 1.5) {
    trajectoryStatus = 'accelerating';
  } else {
    trajectoryStatus = 'steady_progress';
  }

  if (slope > 0.1 && currentRomDeg < targetRomDeg) {
    const neededDeg = targetRomDeg - currentRomDeg;
    const estDays = Math.ceil(neededDeg / slope);
    daysToFullRecovery = estDays;

    const latestDate = new Date(sorted[n - 1].dateIso);
    if (!isNaN(latestDate.getTime())) {
      latestDate.setDate(latestDate.getDate() + estDays);
      estimatedFullRecoveryDate = latestDate.toISOString().split('T')[0];
    }
  } else if (currentRomDeg >= targetRomDeg) {
    daysToFullRecovery = 0;
    estimatedFullRecoveryDate = sorted[n - 1].dateIso.split('T')[0];
  }

  const roundedSlope = Math.round(slope * 100) / 100;
  const roundedIntercept = Math.round(intercept * 10) / 10;

  let clinicalSummaryTh = '';
  if (trajectoryStatus === 'accelerating') {
    clinicalSummaryTh = `อัตราการฟื้นฟูพัฒนาขึ้นอย่างรวดเร็ว (+${roundedSlope}°/วัน) ดัชนีความนิ่งข้อต่อ ${jointStabilityIndex}/100 คาดว่าจะฟื้นตัวเต็มเป้าหมายภายใน ${daysToFullRecovery} วัน`;
  } else if (trajectoryStatus === 'steady_progress') {
    clinicalSummaryTh = `พัฒนาการเป็นไปตามแผนการรักษา (+${roundedSlope}°/วัน) องศาข้อต่อฟื้นตัวแล้ว ${percentRecovery}% ของเป้าหมาย`;
  } else if (trajectoryStatus === 'plateau_monitored') {
    clinicalSummaryTh = `องศาข้อต่อเริ่มคงที่ (Plateau) ที่ประมาณ ${currentRomDeg}° แนะนำให้นักกายภาพบำบัดพิจารณาปรับท่าฝึกหรือเพิ่มเทคนิค Manual Therapy`;
  } else {
    clinicalSummaryTh = `ตรวจพบแนวโน้มองศาลดลง (-${Math.abs(roundedSlope)}°/วัน) หรือเกิดอาการบาดเจ็บ ควรตรวจสอบอาการเจ็บปวดและลดแรงต้าน`;
  }

  return {
    slopeDegPerDay: roundedSlope,
    interceptRomDeg: roundedIntercept,
    rSquared,
    currentRomDeg,
    targetRomDeg,
    baselineRomDeg,
    percentRecovery,
    jointStabilityIndex,
    estimatedFullRecoveryDate,
    daysToFullRecovery,
    trajectoryStatus,
    clinicalSummaryTh,
  };
}
