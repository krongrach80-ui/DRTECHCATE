import React, { useState, useEffect, useCallback } from 'react';
import { PlanExerciseItem } from '../../../../packages/mission-engine/src/index.js';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { Check, Plus, Bell, Info } from 'lucide-react';

interface PhysioStepViewProps {
  exercise: PlanExerciseItem;
  currentIndex: number;
  totalExercises: number;
  onStepComplete: () => void;
  onCallStaff: () => void;
  lang?: 'th' | 'en' | 'cn';
}

const I18N = {
  th: {
    stepBadge: (idx: number, total: number) => `ท่าที่ ${idx} / ${total}`,
    callStaff: 'เรียกเจ้าหน้าที่',
    callingStaff: 'ส่งคำเรียกแล้ว',
    guidance: (set: number, totalSets: number, reps: number, targetReps: number) =>
      `เซ็ตที่ ${set} / ${totalSets} • ทำได้ ${reps} / ${targetReps} ครั้ง`,
    repCounterTitle: 'นับจำนวนครั้ง (Reps Counter)',
    setLabel: (set: number, totalSets: number) => `เซ็ตที่ ${set} จาก ${totalSets} เซ็ต`,
    tapAddRep: 'แตะเพื่อนับครั้ง (+1 Rep)',
    completedAllSets: 'ครบจำนวนเซ็ตเป้าหมายแล้ว',
    doneBtn: 'บันทึกทำเสร็จแล้ว (ไปยังท่าถัดไป)',
  },
  en: {
    stepBadge: (idx: number, total: number) => `Exercise ${idx} / ${total}`,
    callStaff: 'Call Staff',
    callingStaff: 'Staff Notified',
    guidance: (set: number, totalSets: number, reps: number, targetReps: number) =>
      `Set ${set} / ${totalSets} • Completed ${reps} / ${targetReps} reps`,
    repCounterTitle: 'Reps Counter',
    setLabel: (set: number, totalSets: number) => `Set ${set} of ${totalSets}`,
    tapAddRep: 'Tap to Count (+1 Rep)',
    completedAllSets: 'All Target Sets Completed',
    doneBtn: 'Complete & Next Exercise',
  },
  cn: {
    stepBadge: (idx: number, total: number) => `动作 ${idx} / ${total}`,
    callStaff: '呼叫医护人员',
    callingStaff: '已呼叫医护人员',
    guidance: (set: number, totalSets: number, reps: number, targetReps: number) =>
      `第 ${set} / ${totalSets} 组 • 已完成 ${reps} / ${targetReps} 次`,
    repCounterTitle: '次数计数 (Reps Counter)',
    setLabel: (set: number, totalSets: number) => `第 ${set} / ${totalSets} 组`,
    tapAddRep: '点击计数 (+1 次)',
    completedAllSets: '已完成所有目标组数',
    doneBtn: '完成并进入下一动作',
  },
} as const;

export const PhysioStepView: React.FC<PhysioStepViewProps> = ({
  exercise,
  currentIndex,
  totalExercises,
  onStepComplete,
  onCallStaff,
  lang = 'th',
}) => {
  const t = I18N[lang] || I18N.th;

  const targetReps = Math.max(1, exercise.target_reps || 10);
  const targetSets = Math.max(1, exercise.target_sets || 3);

  const [currentReps, setCurrentReps] = useState<number>(0);
  const [currentSet, setCurrentSet] = useState<number>(1);
  const [staffCallCooldown, setStaffCallCooldown] = useState<boolean>(false);

  // รีเซ็ตจำนวนครั้งและเซ็ตทุกครั้งที่เปลี่ยนท่าฝึกใหม่
  useEffect(() => {
    setCurrentReps(0);
    setCurrentSet(1);
  }, [currentIndex, exercise.id, exercise.title]);

  const isAllCompleted = currentSet >= targetSets && currentReps >= targetReps;

  // แยกการอัปเดต State ไม่ให้ซ้อนกันภายใน Updater Function (ป้องกันบั๊ก React 18 StrictMode)
  const handleAddRep = useCallback(() => {
    if (isAllCompleted) return;

    const nextReps = currentReps + 1;
    if (nextReps >= targetReps) {
      if (currentSet < targetSets) {
        setCurrentSet((prevSet) => prevSet + 1);
        setCurrentReps(0);
      } else {
        setCurrentReps(targetReps);
      }
    } else {
      setCurrentReps(nextReps);
    }
  }, [currentReps, currentSet, targetReps, targetSets, isAllCompleted]);

  const handleStaffClick = useCallback(() => {
    if (staffCallCooldown) return;
    setStaffCallCooldown(true);
    onCallStaff();
    setTimeout(() => {
      setStaffCallCooldown(false);
    }, 10000);
  }, [staffCallCooldown, onCallStaff]);

  const safeRingProgress = Math.min(10, Math.max(0, Math.round((currentReps / targetReps) * 10)));

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-6 px-6 select-none bg-slate-950">
      {/* Top Banner: Progress indicator */}
      <div className="w-full max-w-4xl flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-400 font-bold font-mono text-sm border border-blue-500/20">
            {t.stepBadge(currentIndex + 1, totalExercises)}
          </span>
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-normal">
            {exercise.title}
          </h3>
        </div>

        <button
          type="button"
          onClick={handleStaffClick}
          disabled={staffCallCooldown}
          className={`touch-btn px-4 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
            staffCallCooldown
              ? 'bg-slate-800/60 border-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-rose-600/20 hover:bg-rose-600/30 border-rose-500/30 text-rose-300 cursor-pointer'
          }`}
        >
          <Bell className={`w-4 h-4 text-rose-400 ${staffCallCooldown ? '' : 'animate-bounce'}`} />
          <span>{staffCallCooldown ? t.callingStaff : t.callStaff}</span>
        </button>
      </div>

      {/* Main Split Screen: Mirror Camera & Exercise Guidance */}
      <div className="my-auto w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Mirror Camera (7 cols) */}
        <div className="lg:col-span-7 h-80 sm:h-96">
          <MirrorCanvas
            showRing={true}
            ringProgress={safeRingProgress}
            guidanceText={t.guidance(currentSet, targetSets, currentReps, targetReps)}
            className="w-full h-full"
          />
        </div>

        {/* Right: Counter & Set Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col items-center text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {t.repCounterTitle}
            </span>

            {/* Giant Rep Number */}
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-6xl sm:text-7xl font-extrabold text-blue-400 font-mono">
                {currentReps}
              </span>
              <span className="text-2xl text-slate-500 font-semibold font-mono">
                / {targetReps}
              </span>
            </div>

            <div className="text-sm font-medium text-slate-300">
              {t.setLabel(currentSet, targetSets)}
            </div>

            {/* Tap to count rep button */}
            <button
              type="button"
              onClick={handleAddRep}
              disabled={isAllCompleted}
              className={`touch-btn w-full mt-4 py-4 rounded-2xl border font-bold text-lg flex items-center justify-center gap-2 transition ${
                isAllCompleted
                  ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300 cursor-default'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300 cursor-pointer'
              }`}
            >
              {isAllCompleted ? (
                <>
                  <Check className="w-6 h-6 text-emerald-400" />
                  <span>{t.completedAllSets}</span>
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6 text-blue-400" />
                  <span>{t.tapAddRep}</span>
                </>
              )}
            </button>
          </div>

          {exercise.description && (
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>{exercise.description}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action: "ทำเสร็จแล้ว" (Done) Button */}
      <div className="w-full max-w-xl pb-2">
        <button
          type="button"
          onClick={onStepComplete}
          className="touch-btn w-full py-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xl shadow-2xl shadow-emerald-600/30 flex items-center justify-center gap-3 cursor-pointer"
        >
          <Check className="w-7 h-7 stroke-[3]" />
          <span>{t.doneBtn}</span>
        </button>
      </div>
    </div>
  );
};
