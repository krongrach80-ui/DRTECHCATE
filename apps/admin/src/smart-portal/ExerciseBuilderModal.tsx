/**
 * apps/admin/src/smart-portal/ExerciseBuilderModal.tsx
 *
 * NO-CODE AI EXERCISE BUILDER STUDIO
 * Allows Physical Therapists and Administrators to create, edit, clone,
 * and calibrate exercises with live webcam motion capture.
 */

import React, { useState } from 'react';
import {
  X,
  Activity,
  Camera,
  Save,
  CheckCircle2,
  Copy,
  Sliders,
  ShieldAlert,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  ExerciseDetectionConfig,
  EvaluationMode,
  TargetJoint,
  BodySide,
  CameraViewOrientation,
  LandmarkTriplet,
} from '../../../../packages/pose-engine/src/types/exerciseConfig';
import { LiveMotionCaptureCalibrator } from './LiveMotionCaptureCalibrator';
import { CalibrationResult } from '../../../../packages/pose-engine/src/engine/calibrationRecorder';

interface ExerciseBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (config?: ExerciseDetectionConfig) => void;
  exerciseToEdit?: any | null;
  isClone?: boolean;
}

const DEFAULT_JOINT_TRIPLETS: Record<TargetJoint, { left: LandmarkTriplet; right: LandmarkTriplet }> = {
  shoulder: {
    left: { pointA: 23, vertex: 11, pointB: 15, use3DWorld: true }, // Hip -> Shoulder -> Wrist
    right: { pointA: 24, vertex: 12, pointB: 16, use3DWorld: true },
  },
  elbow: {
    left: { pointA: 11, vertex: 13, pointB: 15, use3DWorld: true }, // Shoulder -> Elbow -> Wrist
    right: { pointA: 12, vertex: 14, pointB: 16, use3DWorld: true },
  },
  wrist: {
    left: { pointA: 13, vertex: 15, pointB: 19, use3DWorld: false },
    right: { pointA: 14, vertex: 16, pointB: 20, use3DWorld: false },
  },
  hip: {
    left: { pointA: 11, vertex: 23, pointB: 25, use3DWorld: true }, // Shoulder -> Hip -> Knee
    right: { pointA: 12, vertex: 24, pointB: 26, use3DWorld: true },
  },
  knee: {
    left: { pointA: 23, vertex: 25, pointB: 27, use3DWorld: true }, // Hip -> Knee -> Ankle
    right: { pointA: 24, vertex: 26, pointB: 28, use3DWorld: true },
  },
  ankle: {
    left: { pointA: 25, vertex: 27, pointB: 31, use3DWorld: false },
    right: { pointA: 26, vertex: 28, pointB: 32, use3DWorld: false },
  },
  neck: {
    left: { pointA: 11, vertex: 0, pointB: 12, use3DWorld: false },
    right: { pointA: 12, vertex: 0, pointB: 11, use3DWorld: false },
  },
  trunk: {
    left: { pointA: 11, vertex: 23, pointB: 24, use3DWorld: true },
    right: { pointA: 12, vertex: 24, pointB: 23, use3DWorld: true },
  },
};

export const ExerciseBuilderModal: React.FC<ExerciseBuilderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  exerciseToEdit,
  isClone = false,
}) => {
  // Basic Info
  const [nameTh, setNameTh] = useState(
    exerciseToEdit ? (isClone ? `${exerciseToEdit.title} (คัดลอก)` : exerciseToEdit.title) : ''
  );
  const [nameEn, setNameEn] = useState(exerciseToEdit?.nameEn || '');
  const [description, setDescription] = useState(exerciseToEdit?.description || '');
  const [targetJoint, setTargetJoint] = useState<TargetJoint>(
    (exerciseToEdit?.target_joint as TargetJoint) || 'shoulder'
  );
  const [side, setSide] = useState<BodySide>('right');
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>(
    exerciseToEdit?.detection_config?.evaluationMode || 'angle_rep_hold'
  );

  // Camera Guide
  const [recommendedView, setRecommendedView] = useState<CameraViewOrientation>('side_45');
  const [minDistance, setMinDistance] = useState<number>(1.5);
  const [maxDistance, setMaxDistance] = useState<number>(2.5);
  const [instructionTextTh, setInstructionTextTh] = useState<string>(
    'ยืนหันข้างเฉียง 45° ถึง 90° ระยะห่าง 1.5 - 2.5 เมตรจากกล้อง'
  );

  // Angle Mechanics
  const [startAngleDeg, setStartAngleDeg] = useState<number>(15);
  const [targetMinDeg, setTargetMinDeg] = useState<number>(80);
  const [targetMaxDeg, setTargetMaxDeg] = useState<number>(100);
  const [toleranceDeg, setToleranceDeg] = useState<number>(10);
  const [holdDurationSec, setHoldDurationSec] = useState<number>(2.0);

  // Pendulum Mechanics
  const [minTrunkTilt, setMinTrunkTilt] = useState<number>(18);
  const [maxTrunkTilt, setMaxTrunkTilt] = useState<number>(65);
  const [minElbowStraightness, setMinElbowStraightness] = useState<number>(145);

  // Prescription
  const [repsPerSet, setRepsPerSet] = useState<number>(exerciseToEdit?.default_reps || 10);
  const [totalSets, setTotalSets] = useState<number>(exerciseToEdit?.default_sets || 3);
  const [restBetweenSetsSec, setRestBetweenSetsSec] = useState<number>(30);

  // Safety
  const [stopOnPainMessageTh, setStopOnPainMessageTh] = useState<string>(
    'หากรู้สึกเจ็บบริเวณข้อต่อ ให้หยุดพักทันที'
  );
  const [maxSafeAngleCapDeg, setMaxSafeAngleCapDeg] = useState<number>(135);

  // Calibrator Modal state
  const [isCalibratorOpen, setIsCalibratorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTriplet = DEFAULT_JOINT_TRIPLETS[targetJoint]?.[side === 'left' ? 'left' : 'right'] || {
    pointA: 24,
    vertex: 12,
    pointB: 16,
    use3DWorld: true,
  };

  const handleApplyCalibration = (cal: CalibrationResult) => {
    setStartAngleDeg(cal.startAngleDeg);
    setTargetMinDeg(cal.targetMinDeg);
    setTargetMaxDeg(cal.targetMaxDeg);
    setHoldDurationSec(cal.holdDurationSec);
    setToleranceDeg(cal.toleranceDeg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameTh.trim()) {
      setErrorMsg('กรุณากรอกชื่อท่ากายภาพภาษาไทย');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const detectionConfig: ExerciseDetectionConfig = {
      nameTh: nameTh.trim(),
      nameEn: nameEn.trim() || nameTh.trim(),
      description: description.trim(),
      evaluationMode,
      side,
      targetJoint,
      cameraGuide: {
        recommendedView,
        recommendedDistanceMeters: [minDistance, maxDistance],
        instructionTextTh: instructionTextTh.trim(),
      },
      angleMechanics:
        evaluationMode === 'angle_rep_hold'
          ? {
              landmarks: DEFAULT_JOINT_TRIPLETS[targetJoint],
              startAngleDeg,
              targetMinDeg,
              targetMaxDeg,
              toleranceDeg,
              holdDurationSec,
            }
          : undefined,
      pendulumMechanics:
        evaluationMode === 'pendulum_circular'
          ? {
              minTrunkForwardTiltDeg: minTrunkTilt,
              maxTrunkForwardTiltDeg: maxTrunkTilt,
              minElbowStraightnessDeg: minElbowStraightness,
              minCircleRadiusRatio: 0.07,
              maxCircleRadiusRatio: 0.35,
              minCycleDurationSec: 1.2,
              maxCycleDurationSec: 5.0,
            }
          : undefined,
      defaultPrescription: {
        repsPerSet,
        totalSets,
        restBetweenSetsSec,
      },
      compensationRules: [
        {
          ruleId: `${targetJoint}_trunk_lean`,
          type: 'trunk_lean',
          thresholdValue: 0.18,
          warningMessageTh: 'รักษาลำตัวให้ตรงและนิ่ง ไม่เอียงชดเชย',
          severity: 'warning',
        },
      ],
      safetyContraindications: {
        stopOnPainMessageTh: stopOnPainMessageTh.trim(),
        maxSafeAngleCapDeg,
      },
    };

    try {
      if (exerciseToEdit?.id && !isClone) {
        await defaultApiClient.exercises.update(exerciseToEdit.id, {
          title: nameTh.trim(),
          target_joint: targetJoint,
          description: description.trim(),
          default_sets: totalSets,
          default_reps: repsPerSet,
          warnings: stopOnPainMessageTh.trim(),
          detection_config: detectionConfig,
        });
      } else {
        await defaultApiClient.exercises.create({
          title: nameTh.trim(),
          target_joint: targetJoint,
          description: description.trim(),
          default_sets: totalSets,
          default_reps: repsPerSet,
          difficulty: 'beginner',
          warnings: stopOnPainMessageTh.trim(),
          detection_config: detectionConfig,
        });
      }

      onSuccess(detectionConfig);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกท่าฝึกได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
        <div className="w-full max-w-3xl rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl p-6 sm:p-8 text-white max-h-[92vh] overflow-y-auto flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {exerciseToEdit
                      ? isClone
                        ? 'คัดลอกและสร้างท่าฝึกใหม่ (Clone Exercise)'
                        : 'แก้ไขการกำหนดค่า AI ตรวจจับท่ากายภาพ'
                      : 'สตูดิโอสร้างท่ากายภาพ AI อัจฉริยะ (No-Code AI Studio)'}
                  </h2>
                  <div className="text-xs text-slate-400">
                    กำหนดค่าไบโอเมคานิกส์ มุมองศา และท่าต้นแบบด้วยตัวคุณเอง
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs">
                {errorMsg}
              </div>
            )}

            {/* 1. Basic Information */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span>1. ข้อมูลพื้นฐานท่ากายภาพ</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">ชื่อท่า (ภาษาไทย) *</label>
                  <input
                    type="text"
                    required
                    value={nameTh}
                    onChange={(e) => setNameTh(e.target.value)}
                    placeholder="เช่น Shoulder Pendulum หรือ กางแขนยกด้านข้าง"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">ชื่อท่า (English)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Shoulder Pendulum / Shoulder Abduction"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">ข้อต่อเป้าหมาย (Target Joint)</label>
                  <select
                    value={targetJoint}
                    onChange={(e) => setTargetJoint(e.target.value as TargetJoint)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="shoulder">หัวไหล่ (Shoulder)</option>
                    <option value="elbow">ข้อศอก (Elbow)</option>
                    <option value="wrist">ข้อมือ (Wrist)</option>
                    <option value="hip">ข้อสะโพก (Hip)</option>
                    <option value="knee">ข้อเข่า (Knee)</option>
                    <option value="ankle">ข้อเท้า (Ankle)</option>
                    <option value="trunk">ลำตัว (Trunk)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">ข้างที่ฝึก (Side)</label>
                  <select
                    value={side}
                    onChange={(e) => setSide(e.target.value as BodySide)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="right">ข้างขวา (Right)</option>
                    <option value="left">ข้างซ้าย (Left)</option>
                    <option value="bilateral">ทั้งสองข้าง (Bilateral)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">โหมดการประเมิน (AI Mode)</label>
                  <select
                    value={evaluationMode}
                    onChange={(e) => setEvaluationMode(e.target.value as EvaluationMode)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="angle_rep_hold">ตรวจจับมุมองศา + ค้างท่า (Angle & Hold)</option>
                    <option value="pendulum_circular">แกว่งแขนวงกลม 360° (Shoulder Pendulum)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Biomechanical Kinematics Parameters */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span>2. ค่าพารามิเตอร์ชีวกลศาสตร์ (Biomechanical Parameters)</span>
                </div>
                {evaluationMode === 'angle_rep_hold' && (
                  <button
                    type="button"
                    onClick={() => setIsCalibratorOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/50 hover:to-teal-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>🎥 บันทึกท่าต้นแบบจากกล้อง</span>
                  </button>
                )}
              </div>

              {evaluationMode === 'angle_rep_hold' ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">มุมเริ่มต้น (°)</label>
                    <input
                      type="number"
                      value={startAngleDeg}
                      onChange={(e) => setStartAngleDeg(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">มุมเป้าหมายต่ำสุด (°)</label>
                    <input
                      type="number"
                      value={targetMinDeg}
                      onChange={(e) => setTargetMinDeg(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">มุมเป้าหมายสูงสุด (°)</label>
                    <input
                      type="number"
                      value={targetMaxDeg}
                      onChange={(e) => setTargetMaxDeg(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">ความคลาดเคลื่อน (±°)</label>
                    <input
                      type="number"
                      value={toleranceDeg}
                      onChange={(e) => setToleranceDeg(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">เวลาค้างท่า (วินาที)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={holdDurationSec}
                      onChange={(e) => setHoldDurationSec(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                </div>
              ) : (
                /* Pendulum Kinematics Form */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">การโน้มตัวต่ำสุด (°)</label>
                    <input
                      type="number"
                      value={minTrunkTilt}
                      onChange={(e) => setMinTrunkTilt(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">การโน้มตัวสูงสุด (°)</label>
                    <input
                      type="number"
                      value={maxTrunkTilt}
                      onChange={(e) => setMaxTrunkTilt(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">ความตรงของข้อศอก (&ge; °)</label>
                    <input
                      type="number"
                      value={minElbowStraightness}
                      onChange={(e) => setMinElbowStraightness(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Prescription Defaults */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <span>3. ใบสั่งการฝึกมาตรฐาน (Default Prescription)</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">จำนวนครั้งต่อเซ็ต</label>
                  <input
                    type="number"
                    value={repsPerSet}
                    onChange={(e) => setRepsPerSet(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">จำนวนเซ็ตทั้งหมด</label>
                  <input
                    type="number"
                    value={totalSets}
                    onChange={(e) => setTotalSets(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">พักระหว่างเซ็ต (วินาที)</label>
                  <input
                    type="number"
                    value={restBetweenSetsSec}
                    onChange={(e) => setRestBetweenSetsSec(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 4. Safety Contraindications */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                <span>4. ขีดจำกัดความปลอดภัย & คำเตือนเมื่อเจ็บ (Safety Contraindications)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ข้อความเตือนให้หยุดเมื่อเจ็บ</label>
                  <input
                    type="text"
                    value={stopOnPainMessageTh}
                    onChange={(e) => setStopOnPainMessageTh(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">มุมปลอดภัยสูงสุด (Max Safe Angle Cap °)</label>
                  <input
                    type="number"
                    value={maxSafeAngleCapDeg}
                    onChange={(e) => setMaxSafeAngleCapDeg(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Submit Action Bar */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าท่าฝึก (Save Config)'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Live Motion-Capture Calibrator Modal */}
      {isCalibratorOpen && (
        <LiveMotionCaptureCalibrator
          isOpen={isCalibratorOpen}
          onClose={() => setIsCalibratorOpen(false)}
          onApplyCalibration={handleApplyCalibration}
          triplet={currentTriplet}
          jointNameTh={nameTh || 'ข้อต่อเป้าหมาย'}
        />
      )}
    </>
  );
};
