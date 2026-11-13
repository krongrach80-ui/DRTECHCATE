import React, { useRef, useState, useCallback } from 'react';
import { MinigameQuestion } from '../../../../packages/mission-engine/src/index.js';
import { PhysicalCardGame } from '../minigame-cards/index.js';
import { Bell } from 'lucide-react';

interface MinigameStepViewProps {
  question: MinigameQuestion | null;
  onAnswer: (choice: string) => void;
  onCallStaff: () => void;
}

export const MinigameStepView: React.FC<MinigameStepViewProps> = ({
  onAnswer,
  onCallStaff,
}) => {
  const hasAnsweredRef = useRef<boolean>(false);
  const [staffCalled, setStaffCalled] = useState<boolean>(false);

  const handleFinish = useCallback(
    (choice: string) => {
      if (hasAnsweredRef.current) return;
      hasAnsweredRef.current = true;
      onAnswer(choice);
    },
    [onAnswer]
  );

  const handleStaffClick = useCallback(() => {
    if (staffCalled) return;
    setStaffCalled(true);
    onCallStaff();
    setTimeout(() => {
      setStaffCalled(false);
    }, 10000);
  }, [staffCalled, onCallStaff]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center select-none bg-[#EDF7F1] relative">
      {/* Floating Call Staff Button */}
      <div className="absolute top-4 right-4 z-30">
        <button
          type="button"
          onClick={handleStaffClick}
          disabled={staffCalled}
          className="px-4 py-2 rounded-2xl bg-white/90 hover:bg-white border border-rose-200 text-rose-600 text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-60 transition"
        >
          <Bell className="w-4 h-4 text-rose-500" />
          <span>{staffCalled ? 'แจ้งเจ้าหน้าที่แล้ว' : 'เรียกเจ้าหน้าที่'}</span>
        </button>
      </div>

      <PhysicalCardGame
        maxQuestions={10}
        onComplete={(_finalScore, _totalQuestions) => {
          handleFinish('yes');
        }}
        onExit={() => {
          handleFinish('yes');
        }}
      />
    </div>
  );
};
