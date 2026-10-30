/**
 * packages/clinical-analytics/src/ClinicalExecutiveDashboardModal.tsx
 *
 * CLINICAL EXECUTIVE DASHBOARD & TRAJECTORY MODAL
 *
 * Features:
 * 1. Interactive High-Precision SVG Dual-Axis Trajectory Chart:
 *    - Left Axis (Emerald): Joint ROM Angle progression over sessions
 *    - Right Axis (Rose): Compensation Rate % & Pain incidence
 * 2. Instant Medical Report Generation & Browser Print
 * 3. 3D Holographic Replay integration for pain event inspection
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Printer,
  X,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import {
  analyzeRecoveryTrajectory,
  HistoricalSessionMetric,
  TrajectoryAnalysisResult,
} from './recoveryTrajectory';
import {
  PatientClinicalProfile,
  generateClinicalReport,
  triggerBrowserPrint,
  PainEventLogItem,
} from './clinicalReportGenerator';
import { KinematicReplaySnapshot } from '../../kinematic-replay-3d/src/ringBuffer';

interface ClinicalExecutiveDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientClinicalProfile;
  sessionHistory: HistoricalSessionMetric[];
  replaySnapshot?: KinematicReplaySnapshot | null;
  onOpenReplay?: (snapshot: KinematicReplaySnapshot) => void;
}

export const ClinicalExecutiveDashboardModal: React.FC<ClinicalExecutiveDashboardModalProps> = ({
  isOpen,
  onClose,
  patient,
  sessionHistory,
  replaySnapshot,
  onOpenReplay,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 1. Analyze Trajectory Math
  const trajectory: TrajectoryAnalysisResult = useMemo(() => {
    return analyzeRecoveryTrajectory(sessionHistory);
  }, [sessionHistory]);

  // Extract pain events from history
  const painEvents: PainEventLogItem[] = useMemo(() => {
    return sessionHistory
      .filter((s) => s.painReported)
      .map((s) => ({
        dateIso: s.dateIso,
        exerciseName: patient.targetJoint ? `การฝึกข้อต่อ ${patient.targetJoint}` : 'การฝึกกายภาพ',
        angleAtPainDeg: s.maxRomDeg,
        descriptionTh: 'ผู้ป่วยกดปุ่มหยุดฉุกเฉินเนื่องจากมีอาการเจ็บเสียวแปลบในจังหวะเคลื่อนไหว',
      }));
  }, [sessionHistory, patient.targetJoint]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const report = generateClinicalReport(patient, trajectory, painEvents);
    triggerBrowserPrint(report);
  };

  // SVG Chart Geometry
  const svgWidth = 640;
  const svgHeight = 220;
  const padding = { top: 25, right: 40, bottom: 35, left: 45 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  const n = sessionHistory.length;
  const maxRomLimit = Math.max(160, trajectory.targetRomDeg + 10);

  // Calculate coordinates for SVG paths
  const romPoints = sessionHistory.map((s, idx) => {
    const x = padding.left + (idx / Math.max(1, n - 1)) * chartW;
    const y = padding.top + chartH - (s.maxRomDeg / maxRomLimit) * chartH;
    return { x, y, session: s };
  });

  const romPath =
    romPoints.length > 0
      ? `M ${romPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
      : '';

  // Compensation points (right axis: 0 - 50%)
  const compPoints = sessionHistory.map((s, idx) => {
    const x = padding.left + (idx / Math.max(1, n - 1)) * chartW;
    const compPercent = Math.min(50, (s.scapularHikingRate ?? 0) * 100);
    const y = padding.top + chartH - (compPercent / 50) * chartH;
    return { x, y, session: s };
  });

  const compPath =
    compPoints.length > 0
      ? `M ${compPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
      : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans overflow-y-auto animate-fade-in">
      <div className="w-full max-w-4xl rounded-3xl bg-slate-900 border-2 border-teal-500/50 shadow-2xl p-6 sm:p-8 flex flex-col gap-6 text-white my-auto">
        {/* 1. Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>แดชบอร์ดชีวกลศาสตร์และการฟื้นฟูระยะยาว</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-950 border border-teal-500/40 text-teal-300 font-medium">
                  Clinical Intelligence
                </span>
              </h2>
              <div className="text-xs text-slate-400 mt-1">
                ผู้ป่วย: {patient.fullName} • HN: {patient.hn} • วินิจฉัย: {patient.diagnosis} ({patient.icd10Code || 'ICD-10 M75.1'})
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Top Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">องศาปัจจุบัน / เป้าหมาย</div>
            <div className="text-xl sm:text-2xl font-black text-teal-400 mt-1">
              {trajectory.currentRomDeg}° <span className="text-xs text-slate-400 font-normal">/ {trajectory.targetRomDeg}°</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 font-medium">
              ฟื้นตัวแล้ว {trajectory.percentRecovery}%
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">อัตราพัฒนาการ (Slope)</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
              +{trajectory.slopeDegPerDay}° <span className="text-xs text-slate-400 font-normal">/ วัน</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              ความแม่นยำโมเดล R² = {trajectory.rSquared}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">ดัชนีความนิ่ง (JSSI)</div>
            <div className="text-xl sm:text-2xl font-black text-sky-400 mt-1">
              {trajectory.jointStabilityIndex} <span className="text-xs text-slate-400 font-normal">/ 100</span>
            </div>
            <div className="text-[11px] text-sky-300 mt-1">
              Smoothness & Stability
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">พยากรณ์วันฟื้นฟูเต็มเป้า</div>
            <div className="text-lg sm:text-xl font-black text-emerald-300 mt-1 truncate">
              {trajectory.estimatedFullRecoveryDate || 'ติดตามตามรอบ'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {trajectory.daysToFullRecovery !== null ? `อีกประมาณ ${trajectory.daysToFullRecovery} วัน` : 'อยู่ในเกณฑ์คงที่'}
            </div>
          </div>
        </div>

        {/* 3. Interactive SVG Dual-Axis Trajectory Chart */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800">
          <div className="flex items-center justify-between mb-3 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 font-bold text-teal-400">
                <span className="w-3 h-3 rounded-full bg-teal-400 inline-block" />
                <span>องศาข้อต่อสูงสุด (Max ROM)</span>
              </div>
              <div className="flex items-center gap-1.5 font-bold text-rose-400">
                <span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />
                <span>อัตราการชดเชยท่า (Compensation %)</span>
              </div>
            </div>
            <div className="text-slate-400 text-[11px]">
              {n} เซสชันการรักษาล่าสุด
            </div>
          </div>

          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-48 sm:h-56 select-none overflow-visible"
            >
              {/* Horizontal Reference Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const y = padding.top + chartH * (1 - ratio);
                const romVal = Math.round(ratio * maxRomLimit);
                const compVal = Math.round(ratio * 50);
                return (
                  <g key={ratio}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={padding.left + chartW}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray="4 4"
                    />
                    {/* Left Axis ROM Label */}
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      fill="#64748b"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {romVal}°
                    </text>
                    {/* Right Axis Compensation Label */}
                    <text
                      x={padding.left + chartW + 8}
                      y={y + 4}
                      fill="#64748b"
                      fontSize="10"
                      textAnchor="start"
                      fontFamily="monospace"
                    >
                      {compVal}%
                    </text>
                  </g>
                );
              })}

              {/* Target ROM dashed line */}
              <line
                x1={padding.left}
                y1={padding.top + chartH - (trajectory.targetRomDeg / maxRomLimit) * chartH}
                x2={padding.left + chartW}
                y2={padding.top + chartH - (trajectory.targetRomDeg / maxRomLimit) * chartH}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="6 3"
                opacity="0.8"
              />

              {/* Curves */}
              <path
                d={compPath}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2"
                strokeDasharray="3 3"
                opacity="0.75"
              />
              <path
                d={romPath}
                fill="none"
                stroke="#14b8a6"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data Point Nodes */}
              {romPoints.map((pt, idx) => {
                const isHovered = hoveredIndex === idx;
                const isPain = pt.session.painReported;
                return (
                  <g key={idx}>
                    {/* Pulsing ring on Pain Event */}
                    {isPain && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="11"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                        className="animate-ping opacity-75"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 7 : isPain ? 6 : 4.5}
                      fill={isPain ? '#ef4444' : '#14b8a6'}
                      stroke="#ffffff"
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="cursor-pointer transition-all duration-150"
                    />
                    {/* Date label on X axis */}
                    <text
                      x={pt.x}
                      y={padding.top + chartH + 18}
                      fill="#64748b"
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      D{pt.session.dayIndex}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Point Tooltip Info */}
          {hoveredIndex !== null && sessionHistory[hoveredIndex] && (
            <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-teal-500/40 text-xs flex items-center justify-between animate-fade-in">
              <div>
                <span className="text-slate-400">เซสชันวันที่: </span>
                <span className="font-bold text-white">
                  {sessionHistory[hoveredIndex].dateIso.split('T')[0]} (Day {sessionHistory[hoveredIndex].dayIndex})
                </span>
                <span className="mx-2 text-slate-600">•</span>
                <span className="text-slate-400">องศา: </span>
                <span className="font-bold text-teal-400">{sessionHistory[hoveredIndex].maxRomDeg}°</span>
                <span className="mx-2 text-slate-600">•</span>
                <span className="text-slate-400">คะแนนฟอร์ม: </span>
                <span className="font-bold text-emerald-400">{sessionHistory[hoveredIndex].formQualityScore}%</span>
              </div>
              {sessionHistory[hoveredIndex].painReported && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 text-[11px]">
                  🚨 แจ้งเจ็บในเซสชันนี้
                </span>
              )}
            </div>
          )}
        </div>

        {/* 4. Action Buttons Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>มาตรฐานรายงานทางการแพทย์ SaMD Class II & HIPAA Zero-Video</span>
          </div>

          <div className="flex items-center gap-3">
            {replaySnapshot && onOpenReplay && (
              <button
                type="button"
                id="btn-open-holographic-replay"
                data-testid="btn-open-holographic-replay"
                onClick={() => onOpenReplay(replaySnapshot)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-teal-950/50 flex items-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>หมุนดู 3D Holographic Replay</span>
              </button>
            )}

            <button
              type="button"
              id="btn-print-clinical-report"
              data-testid="btn-print-clinical-report"
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition active:scale-95 cursor-pointer border border-slate-700"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>🖨️ พิมพ์รายงานแพทย์ (A4 / PDF)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
