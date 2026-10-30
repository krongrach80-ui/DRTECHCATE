/**
 * apps/admin/src/smart-portal/PatientPrescriptionOverrideModal.tsx
 *
 * PER-PATIENT PRESCRIPTION OVERRIDE MODAL
 * Allows Physical Therapists to customize targetMinDeg, targetMaxDeg, holdDurationSec,
 * reps, and sets specifically for an individual patient without modifying the global exercise template.
 */

import React, { useState, useMemo } from 'react';
import { X, Sliders, CheckCircle2, Activity, Sparkles, ShieldCheck } from 'lucide-react';
import { ExerciseDetectionConfig } from '../../../../packages/pose-engine/src/types/exerciseConfig';
import {
  evaluateAdaptiveProgression,
  SessionHistoryRecord,
} from '../../../../packages/prescription-engine/src/index.js';

interface PatientPrescriptionOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  patientHn?: string;
  exercise: {
    id?: string;
    exercise_id?: string;
    title?: string;
    name?: string;
    sets?: number;
    reps?: number;
    detection_config?: ExerciseDetectionConfig | null;
  };
  patientHistory?: SessionHistoryRecord[];
  onSaveOverride: (overriddenExercise: any) => void;
}

export const PatientPrescriptionOverrideModal: React.FC<PatientPrescriptionOverrideModalProps> = ({
  isOpen,
  onClose,
  patientName,
  patientHn,
  exercise,
  patientHistory = [],
  onSaveOverride,
}) => {
  const existingConfig = exercise.detection_config;

  const [sets, setSets] = useState<number>(exercise.sets || existingConfig?.defaultPrescription?.totalSets || 3);
  const [reps, setReps] = useState<number>(exercise.reps || existingConfig?.defaultPrescription?.repsPerSet || 10);
  const [targetMinDeg, setTargetMinDeg] = useState<number>(
    existingConfig?.angleMechanics?.targetMinDeg || 80
  );
  const [targetMaxDeg, setTargetMaxDeg] = useState<number>(
    existingConfig?.angleMechanics?.targetMaxDeg || 100
  );
  const [holdDurationSec, setHoldDurationSec] = useState<number>(
    existingConfig?.angleMechanics?.holdDurationSec || 2.0
  );
  const [isAiSuggestionApplied, setIsAiSuggestionApplied] = useState<boolean>(false);

  // Compute adaptive AI progression suggestion
  const aiProgression = useMemo(() => {
    return evaluateAdaptiveProgression(patientHistory, {
      targetMinDeg: existingConfig?.angleMechanics?.targetMinDeg || 80,
      targetMaxDeg: existingConfig?.angleMechanics?.targetMaxDeg || 100,
      holdDurationSec: existingConfig?.angleMechanics?.holdDurationSec || 2.0,
      maxSafeAngleCapDeg: existingConfig?.safetyContraindications?.maxSafeAngleCapDeg || 140,
    });
  }, [patientHistory, existingConfig]);

  const handleApplyAiSuggestion = () => {
    if (aiProgression.suggestedTargetMaxDeg) {
      setTargetMaxDeg(aiProgression.suggestedTargetMaxDeg);
    }
    if (aiProgression.suggestedHoldDurationSec) {
      setHoldDurationSec(aiProgression.suggestedHoldDurationSec);
    }
    setIsAiSuggestionApplied(true);
  };

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const overriddenConfig: ExerciseDetectionConfig = existingConfig
      ? {
          ...existingConfig,
          defaultPrescription: {
            ...existingConfig.defaultPrescription,
            repsPerSet: reps,
            totalSets: sets,
          },
          angleMechanics: existingConfig.angleMechanics
            ? {
                ...existingConfig.angleMechanics,
                targetMinDeg,
                targetMaxDeg,
                holdDurationSec,
              }
            : undefined,
        }
      : ({
          nameTh: exercise.title || exercise.name || 'ท่ากายภาพ',
          nameEn: 'Exercise',
          evaluationMode: 'angle_rep_hold',
          side: 'right',
          targetJoint: 'shoulder',
          cameraGuide: {
            recommendedView: 'front',
            recommendedDistanceMeters: [1.5, 2.5],
            instructionTextTh: 'ทำท่าตามคำแนะนำของนักกายภาพบำบัด',
          },
          defaultPrescription: {
            repsPerSet: reps,
            totalSets: sets,
            restBetweenSetsSec: 30,
          },
          angleMechanics: {
            landmarks: {
              left: { pointA: 23, vertex: 11, pointB: 15 },
              right: { pointA: 24, vertex: 12, pointB: 16 },
            },
            startAngleDeg: 15,
            targetMinDeg,
            targetMaxDeg,
            toleranceDeg: 10,
            holdDurationSec,
          },
          compensationRules: [],
          safetyContraindications: {
            stopOnPainMessageTh: 'หยุดทันทีเมื่อรู้สึกเจ็บ',
            maxSafeAngleCapDeg: 140,
          },
        } as ExerciseDetectionConfig);

    onSaveOverride({
      ...exercise,
      sets,
      reps,
      custom_detection_config: overriddenConfig,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-teal-500/50 shadow-2xl p-6 sm:p-8 text-white animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                ปรับแต่งใบสั่งฝึกเฉพาะบุคคล (Prescription Override)
              </h2>
              <div className="text-xs text-slate-400">
                ผู้ป่วย: <span className="text-teal-300 font-bold">{patientName}</span> {patientHn ? `(HN: ${patientHn})` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <Activity className="w-5 h-5 text-teal-400 shrink-0" />
            <div className="text-xs">
              <div className="text-slate-400">ท่ากายภาพบำบัดที่ปรับแต่ง:</div>
              <div className="font-bold text-white text-sm mt-0.5">
                {exercise.title || exercise.name || 'ท่ากายภาพบำบัด'}
              </div>
            </div>
          </div>

          {/* AI Clinical Copilot Suggestion Card */}
          {aiProgression.isEligibleForProgression && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>คำแนะนำจาก AI Clinical Copilot (Progressive Overload)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-200 border border-indigo-700/50">
                  Form Score &ge; 90%
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {aiProgression.clinicalRationaleTh}
              </p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>รอการอนุมัติจากนักกายภาพบำบัด</span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyAiSuggestion}
                  disabled={isAiSuggestionApplied}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                    isAiSuggestionApplied
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/40'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAiSuggestionApplied ? 'อนุมัติคำแนะนำแล้ว ✓' : 'อนุมัติคำแนะนำ AI'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">จำนวนเซ็ต (Sets)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={sets}
                onChange={(e) => setSets(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">จำนวนครั้งต่อเซ็ต (Reps)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={reps}
                onChange={(e) => setReps(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
              />
            </div>
          </div>

          {/* Clinical ROM Overrides */}
          <div className="p-4 rounded-2xl bg-teal-950/30 border border-teal-500/30 space-y-3">
            <div className="text-xs font-bold text-teal-300">
              📐 ช่วงการเคลื่อนไหวเป้าหมายเฉพาะบุคคล (Patient ROM Range):
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">มุมต่ำสุด (°)</label>
                <input
                  type="number"
                  value={targetMinDeg}
                  onChange={(e) => setTargetMinDeg(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">มุมสูงสุด (°)</label>
                <input
                  type="number"
                  value={targetMaxDeg}
                  onChange={(e) => setTargetMaxDeg(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">ค้างท่า (วินาที)</label>
                <input
                  type="number"
                  step="0.5"
                  value={holdDurationSec}
                  onChange={(e) => setHoldDurationSec(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-950/40 cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>บันทึกใบสั่งฝึกเฉพาะบุคคล</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
