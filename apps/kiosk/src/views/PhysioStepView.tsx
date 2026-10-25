import React, { useState } from 'react';
import { PlanExerciseItem } from '../../../../packages/mission-engine/src/index.js';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { Check, Plus, Bell, Info } from 'lucide-react';

interface PhysioStepViewProps {
  exercise: PlanExerciseItem;
  currentIndex: number;
  totalExercises: number;
  onStepComplete: () => void;
  onCallStaff: () => void;
}

export const PhysioStepView: React.FC<PhysioStepViewProps> = ({
  exercise,
  currentIndex,
  totalExercises,
  onStepComplete,
  onCallStaff,
}) => {
  const [currentReps, setCurrentReps] = useState<number>(0);
  const [currentSet, setCurrentSet] = useState<number>(1);

  const targetReps = exercise.target_reps || 10;
  const targetSets = exercise.target_sets || 3;

  const handleAddRep = () => {
    setCurrentReps((prev) => {
      const next = prev + 1;
      if (next >= targetReps) {
        if (currentSet < targetSets) {
          setCurrentSet((s) => s + 1);
          return 0;
        }
      }
      return next;
    });
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-6 px-6 select-none bg-slate-950">
      {/* Top Banner: Progress indicator */}
      <div className="w-full max-w-4xl flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-400 font-bold font-mono text-sm border border-blue-500/20">
            ท่าที่ {currentIndex + 1} / {totalExercises}
          </span>
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-normal">
            {exercise.title}
          </h3>
        </div>

        <button
          onClick={onCallStaff}
          className="touch-btn px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
        >
          <Bell className="w-4 h-4 text-rose-400 animate-bounce" />
          <span>เรียกเจ้าหน้าที่</span>
        </button>
      </div>

      {/* Main Split Screen: Mirror Camera & Exercise Guidance */}
      <div className="my-auto w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Mirror Camera (7 cols) */}
        <div className="lg:col-span-7 h-80 sm:h-96">
          <MirrorCanvas
            showRing={true}
            ringProgress={Math.round((currentReps / targetReps) * 10)}
            guidanceText={`เซ็ตที่ ${currentSet} / ${targetSets} • ทำได้ ${currentReps} / ${targetReps} ครั้ง`}
            className="w-full h-full"
          />
        </div>

        {/* Right: Counter & Set Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col items-center text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              นับจำนวนครั้ง (Reps Counter)
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
              เซ็ตที่ <span className="text-white font-bold">{currentSet}</span> จาก{' '}
              <span className="text-white font-bold">{targetSets}</span> เซ็ต
            </div>

            {/* Tap to count rep button */}
            <button
              onClick={handleAddRep}
              className="touch-btn w-full mt-4 py-4 rounded-2xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-bold text-lg flex items-center justify-center gap-2"
            >
              <Plus className="w-6 h-6 text-blue-400" />
              <span>แตะเพื่อนับครั้ง (+1 Rep)</span>
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
          onClick={onStepComplete}
          className="touch-btn w-full py-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xl shadow-2xl shadow-emerald-600/30 flex items-center justify-center gap-3"
        >
          <Check className="w-7 h-7 stroke-[3]" />
          <span>บันทึกทำเสร็จแล้ว (ไปยังท่าถัดไป)</span>
        </button>
      </div>
    </div>
  );
};
