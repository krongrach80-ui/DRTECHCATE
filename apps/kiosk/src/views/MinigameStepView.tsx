import React, { useState } from 'react';
import { MinigameQuestion } from '../../../../packages/mission-engine/src/index.js';
import { Gamepad2, Sparkles, CheckCircle2 } from 'lucide-react';

interface MinigameStepViewProps {
  question: MinigameQuestion | null;
  onAnswer: (choice: string) => void;
  onCallStaff: () => void;
}

export const MinigameStepView: React.FC<MinigameStepViewProps> = ({
  question,
  onAnswer,
}) => {
  const [selected, setSelected] = useState<string | null>(null);

  const fallbackQuestion: MinigameQuestion = {
    id: 'default-q',
    prompt: 'ภาพใดต่อไปนี้คือท่าบริหารกล้ามเนื้อที่เพิ่งฝึกไป?',
    choices: ['ยืดเหยียดต้นขา', 'กระดกข้อเท้า', 'หมุนหัวไหล่', 'ยกแขนเหนือศีรษะ'],
    answer: 'ยืดเหยียดต้นขา',
  };

  const activeQ = question || fallbackQuestion;

  const handleSelect = (choice: string) => {
    setSelected(choice);
    setTimeout(() => {
      onAnswer(choice);
    }, 700);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-10 px-8 select-none bg-slate-950">
      {/* Title */}
      <div className="text-center max-w-xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold mb-3">
          <Gamepad2 className="w-4 h-4" />
          <span>มินิเกมฝึกความจำและประสาทสัมผัส</span>
        </div>
        <h2 className="text-3xl font-extrabold text-white">
          ทดสอบความจำและความคล่องแคล่ว
        </h2>
        <p className="text-base text-slate-400 mt-1">
          แตะเลือกคำตอบที่ถูกต้องบนหน้าจอสัมผัส
        </p>
      </div>

      {/* Question Card */}
      <div className="my-auto w-full max-w-2xl flex flex-col gap-6">
        <div className="p-8 rounded-3xl bg-slate-900 border border-purple-800/40 shadow-2xl text-center">
          <div className="flex items-center justify-center gap-2 text-purple-400 mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-xs uppercase tracking-widest font-semibold">คำถาม</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
            {activeQ.prompt}
          </h3>
        </div>

        {/* 4 Large Touch Choice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeQ.choices.map((choice, idx) => {
            const isSelected = selected === choice;
            return (
              <button
                key={choice || idx}
                onClick={() => handleSelect(choice)}
                disabled={selected !== null}
                className={`touch-btn p-6 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${
                  isSelected
                    ? 'border-purple-400 bg-purple-600 text-white shadow-xl scale-102 ring-4 ring-purple-400/30'
                    : 'border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold font-mono text-base ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-purple-400 border border-slate-700'
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="text-xl font-bold">{choice}</span>
                </div>
                {isSelected && <CheckCircle2 className="w-6 h-6 text-white animate-pop" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-slate-500 pb-2">
        ผลคะแนนมินิเกมจะถูกบันทึกเพื่อประเมินความก้าวหน้าร่วมกับนักกายภาพบำบัด
      </div>
    </div>
  );
};
