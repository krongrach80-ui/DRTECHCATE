/**
 * apps/kiosk/src/components/PoseCalibrationAndCustomPosePanel.tsx
 *
 * Clinician UI Panel for:
 * 1. Recording a 3-second patient reference pose and computing robust statistical calibration (median + MAD).
 * 2. Reviewing original vs proposed values before explicit clinician confirmation.
 * 3. Resetting per-patient calibration back to pose defaults (with confirmation).
 * 4. Adding new exercise definitions without code edits and immediately using them in session.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CALIBRATION_DURATION_MS,
  CALIBRATION_SAMPLE_INTERVAL_MS,
  CalibrationFrameSample,
  CalibrationProposal,
  DEFAULT_FALLOFF_DEG,
  DEFAULT_POSE_SIDE,
  DEFAULT_POSE_TOLERANCE_DEG,
  MIN_CALIBRATION_FRAMES,
  MIN_CALIBRATION_VISIBILITY,
  POSE_JOINT_PRESETS,
  PatientPoseCalibrationRecord,
  PoseJointPresetKey,
  PoseSide,
  PoseValidationError,
  ValidatedPoseDefinition,
  computeCalibration,
  extractCalibrationSampleFromLandmarks,
  loadCustomPosesFromStorage,
  poseDefinitionToExerciseConfig,
  resetPatientCalibration,
  saveCustomPoseToStorage,
  savePatientCalibration,
} from '../../../../packages/pose-engine/src/calibration/poseSchemaAndCalibration';
import { CLINICAL_EXERCISES_CONFIG } from '../../../../packages/pose-engine/src/presets/exercises.config';
import type {
  BodySide,
  ExerciseDetectionConfig,
  PoseEngineLandmark,
} from '../../../../packages/pose-engine/src/types/exerciseConfig';

export interface PoseCalibrationAndCustomPosePanelProps {
  patientId: string;
  baseConfig: ExerciseDetectionConfig;
  activeConfig: ExerciseDetectionConfig;
  activeSide: BodySide;
  activeCalibration: PatientPoseCalibrationRecord | null;
  getLatestLandmarks: () => PoseEngineLandmark[] | null;
  onCalibrationChange: (calibration: PatientPoseCalibrationRecord | null) => void;
  onSelectPoseConfig: (config: ExerciseDetectionConfig) => void;
}

export const PoseCalibrationAndCustomPosePanel: React.FC<PoseCalibrationAndCustomPosePanelProps> = ({
  patientId,
  baseConfig,
  activeConfig,
  activeSide,
  activeCalibration,
  getLatestLandmarks,
  onCalibrationChange,
  onSelectPoseConfig,
}) => {
  const poseId = baseConfig.id || 'custom-pose';

  // Calibration recording state
  const [isRecording, setIsRecording] = useState(false);
  const [remainingMs, setRemainingMs] = useState(CALIBRATION_DURATION_MS);
  const [collectedFramesCount, setCollectedFramesCount] = useState(0);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CalibrationProposal | null>(null);
  const [clinicianName, setClinicianName] = useState('นักกายภาพบำบัด');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const recordingSamplesRef = useRef<CalibrationFrameSample[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartMsRef = useRef<number>(0);

  // Custom pose modal & catalog state
  const [customPoses, setCustomPoses] = useState<ValidatedPoseDefinition[]>(() =>
    loadCustomPosesFromStorage()
  );
  const [showAddPoseModal, setShowAddPoseModal] = useState(false);
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formSide, setFormSide] = useState<PoseSide>(DEFAULT_POSE_SIDE);
  const [formJointType, setFormJointType] = useState<PoseJointPresetKey>('shoulder');
  const [formTarget, setFormTarget] = useState('90');
  const [formTolerance, setFormTolerance] = useState(String(DEFAULT_POSE_TOLERANCE_DEG));
  const [formFalloff, setFormFalloff] = useState(String(DEFAULT_FALLOFF_DEG));
  const [formHint, setFormHint] = useState('');
  const [formRepsPerSet, setFormRepsPerSet] = useState('10');
  const [formTotalSets, setFormTotalSets] = useState('3');
  const [formErrors, setFormErrors] = useState<PoseValidationError[]>([]);
  const [customPoseNotice, setCustomPoseNotice] = useState<string | null>(null);

  const stopRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingTimer();
    };
  }, [stopRecordingTimer]);

  // Clear pending proposal/error when switching exercise
  useEffect(() => {
    stopRecordingTimer();
    setIsRecording(false);
    setProposal(null);
    setCalibrationError(null);
    setConfirmResetOpen(false);
  }, [poseId, stopRecordingTimer]);

  const finishCalibrationRecording = useCallback(() => {
    stopRecordingTimer();
    setIsRecording(false);

    const origTarget = baseConfig.angleMechanics?.targetMinDeg ?? 90;
    const origTol = baseConfig.angleMechanics?.toleranceDeg ?? DEFAULT_POSE_TOLERANCE_DEG;
    const jointLabel = baseConfig.angleMechanics?.jointNameTh || baseConfig.nameTh;

    const result = computeCalibration(recordingSamplesRef.current, {
      minFrames: MIN_CALIBRATION_FRAMES,
      minVisibility: MIN_CALIBRATION_VISIBILITY,
      originalTarget: origTarget,
      originalTolerance: origTol,
      jointLabelTh: jointLabel,
    });

    if (!result.ok) {
      setProposal(null);
      setCalibrationError(result.messageTh);
      return;
    }

    setCalibrationError(null);
    setProposal(result.proposal);
  }, [baseConfig, stopRecordingTimer]);

  const handleStartCalibration = useCallback(() => {
    if (isRecording) return;
    stopRecordingTimer();
    recordingSamplesRef.current = [];
    recordingStartMsRef.current = Date.now();
    setProposal(null);
    setCalibrationError(null);
    setCollectedFramesCount(0);
    setRemainingMs(CALIBRATION_DURATION_MS);
    setIsRecording(true);

    recordingTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - recordingStartMsRef.current;
      const rem = Math.max(0, CALIBRATION_DURATION_MS - elapsed);
      setRemainingMs(rem);

      const landmarks = getLatestLandmarks();
      const sample = extractCalibrationSampleFromLandmarks(landmarks, baseConfig, activeSide);
      if (sample) {
        recordingSamplesRef.current.push(sample);
        if ((sample.visibility ?? 0) >= MIN_CALIBRATION_VISIBILITY) {
          setCollectedFramesCount((prev) => prev + 1);
        }
      }

      if (elapsed >= CALIBRATION_DURATION_MS) {
        finishCalibrationRecording();
      }
    }, CALIBRATION_SAMPLE_INTERVAL_MS);
  }, [activeSide, baseConfig, finishCalibrationRecording, getLatestLandmarks, isRecording, stopRecordingTimer]);

  const handleConfirmCalibration = useCallback(() => {
    if (!proposal) return;
    const record: PatientPoseCalibrationRecord = {
      patientId: patientId || 'guest-kiosk',
      poseId,
      targetAngleDeg: proposal.target,
      toleranceDeg: proposal.tolerance,
      madDeg: proposal.madDeg,
      iqrDeg: proposal.iqrDeg,
      validFrameCount: proposal.validFrameCount,
      hintTh: proposal.hint,
      calibratedAt: new Date().toISOString(),
      calibratedBy: clinicianName.trim() || 'นักกายภาพบำบัด',
    };
    savePatientCalibration(record);
    setProposal(null);
    setCalibrationError(null);
    onCalibrationChange(record);
  }, [clinicianName, onCalibrationChange, patientId, poseId, proposal]);

  const handleCancelProposal = useCallback(() => {
    setProposal(null);
    setCalibrationError(null);
  }, []);

  const handleConfirmResetCalibration = useCallback(() => {
    resetPatientCalibration(patientId, poseId);
    setConfirmResetOpen(false);
    setProposal(null);
    setCalibrationError(null);
    onCalibrationChange(null);
  }, [onCalibrationChange, patientId, poseId]);

  const handleCreateCustomPose = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormErrors([]);

      const builtInIds = Object.keys(CLINICAL_EXERCISES_CONFIG);
      const preset = POSE_JOINT_PRESETS[formJointType];
      const payload = {
        id: formId.trim(),
        name: formName.trim(),
        side: formSide,
        falloff: formFalloff === '' ? undefined : Number(formFalloff),
        hint: formHint.trim() || undefined,
        repsPerSet: formRepsPerSet === '' ? undefined : Number(formRepsPerSet),
        totalSets: formTotalSets === '' ? undefined : Number(formTotalSets),
        joints: [
          {
            jointType: formJointType,
            target: Number(formTarget),
            tolerance: formTolerance === '' ? undefined : Number(formTolerance),
            direction: preset.defaultDirection,
            startAngleDeg: preset.defaultStartAngleDeg,
          },
        ],
      };

      const res = saveCustomPoseToStorage(payload, { builtInIds });
      if (!res.ok) {
        setFormErrors(res.errors);
        return;
      }

      const updatedList = loadCustomPosesFromStorage();
      setCustomPoses(updatedList);
      const newConfig = poseDefinitionToExerciseConfig(res.value);
      onSelectPoseConfig(newConfig);
      setCustomPoseNotice(`เพิ่มและเปิดใช้ท่า "${res.value.name}" แล้ว`);
      setShowAddPoseModal(false);
      setFormId('');
      setFormName('');
      setFormHint('');
      setFormErrors([]);
    },
    [
      formFalloff,
      formHint,
      formId,
      formJointType,
      formName,
      formRepsPerSet,
      formSide,
      formTarget,
      formTolerance,
      formTotalSets,
      onSelectPoseConfig,
    ]
  );

  const displayedTarget = activeConfig.angleMechanics?.targetMinDeg ?? 90;
  const displayedTolerance =
    activeConfig.angleMechanics?.toleranceDeg ?? DEFAULT_POSE_TOLERANCE_DEG;

  return (
    <div
      id="kiosk-calibration-panel"
      data-testid="kiosk-calibration-panel"
      className="bg-white rounded-3xl border border-slate-200 p-[clamp(0.75rem,1.5vmin,1rem)] shadow-sm flex flex-col gap-2.5 shrink-0"
    >
      {/* Header & Active Mode Indicator (Default vs Calibrated) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[clamp(0.75rem,1.15vw,0.875rem)] font-extrabold text-slate-800">
          ปรับตั้งค่าท่า (PT Calibration)
        </span>
        <span
          data-testid="kiosk-calibration-mode-badge"
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[clamp(0.68rem,1.05vw,0.75rem)] font-extrabold ${
            activeCalibration
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-slate-100 text-slate-700 border-slate-300'
          }`}
        >
          {activeCalibration ? '✓ ค่าเฉพาะบุคคล (Calibrated)' : 'ค่าเริ่มต้นของท่า'}
        </span>
      </div>

      {/* Current Active Target & Tolerance Summary */}
      <div className="grid grid-cols-2 gap-2 text-[clamp(0.7rem,1.05vw,0.8rem)]">
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
          <span className="text-slate-600 font-semibold">มุมเป้าหมาย</span>
          <span className="font-mono font-black text-slate-900">{displayedTarget}°</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
          <span className="text-slate-600 font-semibold">เกณฑ์ยอมรับ</span>
          <span className="font-mono font-black text-slate-900">±{displayedTolerance}°</span>
        </div>
      </div>

      {customPoseNotice && (
        <div className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-2.5 py-1.5">
          {customPoseNotice}
        </div>
      )}

      {/* Calibration Recording / Proposal / Error Area */}
      {isRecording ? (
        <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-1.5 text-center">
          <div className="text-xs font-extrabold text-amber-900">
            กำลังบันทึกท่าต้นแบบ... {(remainingMs / 1000).toFixed(1)} วิ
          </div>
          <div className="text-[11px] font-semibold text-amber-800">
            ให้คนไข้ค้างท่าให้นิ่ง (เก็บได้ {collectedFramesCount} เฟรมที่เห็นชัด)
          </div>
        </div>
      ) : proposal ? (
        <div
          data-testid="kiosk-calibration-proposal-card"
          className="p-3 rounded-2xl bg-sky-50 border border-sky-300 space-y-2 text-xs"
        >
          <div className="font-extrabold text-sky-900">
            ข้อเสนอค่าท่าจากการบันทึก ({proposal.validFrameCount}/{proposal.totalFrameCount} เฟรม)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/80 rounded-xl p-2 border border-sky-200">
              <div className="text-[11px] text-slate-500 font-semibold">ค่าเดิม</div>
              <div className="font-mono font-bold text-slate-800">
                {proposal.originalTarget}° (±{proposal.originalTolerance}°)
              </div>
            </div>
            <div className="bg-white rounded-xl p-2 border border-emerald-300">
              <div className="text-[11px] text-emerald-700 font-semibold">ค่าที่เสนอ (Median)</div>
              <div className="font-mono font-black text-emerald-800">
                {proposal.target}° (±{proposal.tolerance}°)
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-700 bg-white/80 rounded-xl px-2 py-1 border border-sky-100">
            💡 {proposal.hint}
          </div>
          <input
            type="text"
            value={clinicianName}
            onChange={(e) => setClinicianName(e.target.value)}
            placeholder="ชื่อผู้บันทึก (นักกายภาพบำบัด)"
            className="w-full px-2.5 py-1.5 rounded-xl border border-sky-200 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:border-sky-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="kiosk-calibration-confirm-btn"
              onClick={handleConfirmCalibration}
              className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer transition"
            >
              ✓ ยืนยันบันทึก
            </button>
            <button
              type="button"
              data-testid="kiosk-calibration-cancel-btn"
              onClick={handleCancelProposal}
              className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold cursor-pointer transition"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="kiosk-record-calibration-btn"
            onClick={handleStartCalibration}
            className="flex-1 min-w-[9rem] py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs cursor-pointer transition shadow-xs"
          >
            🎯 บันทึกท่าต้นแบบ (3 วิ)
          </button>

          <button
            type="button"
            data-testid="kiosk-open-add-pose-btn"
            onClick={() => {
              setFormErrors([]);
              setShowAddPoseModal(true);
            }}
            className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs cursor-pointer transition"
          >
            ➕ เพิ่มท่าใหม่
          </button>

          {activeCalibration && !confirmResetOpen && (
            <button
              type="button"
              data-testid="kiosk-reset-calibration-btn"
              onClick={() => setConfirmResetOpen(true)}
              className="w-full py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer transition"
            >
              ↺ รีเซ็ตเป็นค่าเดิม
            </button>
          )}
        </div>
      )}

      {confirmResetOpen && (
        <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-300 space-y-2 text-xs">
          <div className="font-bold text-rose-900">
            ยืนยันรีเซ็ตค่า calibration ของท่านี้กลับเป็นค่าเดิม?
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="kiosk-confirm-reset-calibration-btn"
              onClick={handleConfirmResetCalibration}
              className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
            >
              ยืนยันรีเซ็ต
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetOpen(false)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {calibrationError && (
        <div
          data-testid="kiosk-calibration-error"
          className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5"
        >
          ⚠️ {calibrationError}
        </div>
      )}

      {/* Custom Pose Quick Switcher (appears when custom poses exist) */}
      {customPoses.length > 0 && (
        <div className="pt-1 border-t border-slate-100 space-y-1">
          <label className="block text-[11px] font-bold text-slate-600">
            สลับเป็นท่าที่เพิ่มเอง ({customPoses.length} ท่า):
          </label>
          <select
            aria-label="เลือกท่ากายภาพที่เพิ่มเอง"
            value={customPoses.some((p) => p.id === poseId) ? poseId : ''}
            onChange={(e) => {
              const chosen = customPoses.find((p) => p.id === e.target.value);
              if (chosen) {
                onSelectPoseConfig(poseDefinitionToExerciseConfig(chosen));
              }
            }}
            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-500"
          >
            <option value="">-- ท่าหลักปัจจุบัน: {baseConfig.nameTh} --</option>
            {customPoses.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.name} ({cp.joints[0]?.target ?? 90}°)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Modal: Add New Pose Without Editing Code */}
      {showAddPoseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 text-slate-900 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-black text-slate-900">
                ➕ เพิ่มท่ากายภาพใหม่ (ไม่ต้องแก้โค้ด)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPoseModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomPose} className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสท่า (id ภาษาอังกฤษ)*
                  </label>
                  <input
                    type="text"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="เช่น custom-arm-lift-90"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ข้างที่ฝึก (side)
                  </label>
                  <select
                    value={formSide}
                    onChange={(e) => setFormSide(e.target.value as PoseSide)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-bold text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="both">ทั้งสองข้าง (both - ค่าเริ่มต้น)</option>
                    <option value="left">ข้างซ้าย (left)</option>
                    <option value="right">ข้างขวา (right)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อท่ากายภาพ (ภาษาไทย)*
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="เช่น ยกแขนระดับไหล่ 90 องศา"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ข้อต่อหลักที่ใช้ตรวจจับ (Joint)*
                </label>
                <select
                  value={formJointType}
                  onChange={(e) => setFormJointType(e.target.value as PoseJointPresetKey)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-bold text-xs focus:outline-none focus:border-blue-500"
                >
                  {Object.values(POSE_JOINT_PRESETS).map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.labelTh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    มุมเป้าหมาย (0–180°)*
                  </label>
                  <input
                    type="number"
                    value={formTarget}
                    onChange={(e) => setFormTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tolerance (°)
                  </label>
                  <input
                    type="number"
                    value={formTolerance}
                    onChange={(e) => setFormTolerance(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Falloff (°)
                  </label>
                  <input
                    type="number"
                    value={formFalloff}
                    onChange={(e) => setFormFalloff(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวนครั้ง/เซ็ต
                  </label>
                  <input
                    type="number"
                    value={formRepsPerSet}
                    onChange={(e) => setFormRepsPerSet(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวนเซ็ต
                  </label>
                  <input
                    type="number"
                    value={formTotalSets}
                    onChange={(e) => setFormTotalSets(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ข้อความแนะนำ (เลือกใส่ได้)
                </label>
                <input
                  type="text"
                  value={formHint}
                  onChange={(e) => setFormHint(e.target.value)}
                  placeholder="เช่น ค่อยๆ ยกแขนจนถึงระดับไหล่แล้วค้างไว้ 1 วินาที"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {formErrors.length > 0 && (
                <div
                  data-testid="kiosk-add-pose-errors"
                  className="p-3 rounded-2xl bg-rose-50 border border-rose-300 space-y-1 text-xs text-rose-800 font-bold"
                >
                  {formErrors.map((err, idx) => (
                    <div key={`${err.field}-${idx}`}>
                      • [{err.field}] {err.message}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  data-testid="kiosk-save-custom-pose-btn"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold cursor-pointer transition"
                >
                  ✓ บันทึกและเปิดใช้ท่าใหม่ทันที
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPoseModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  ปิด
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

