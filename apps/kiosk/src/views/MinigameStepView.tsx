import React from 'react';
import { MinigameQuestion } from '../../../../packages/mission-engine/src/index.js';
import { PhysicalCardGame } from '../minigame-cards/index.js';

interface MinigameStepViewProps {
  question: MinigameQuestion | null;
  onAnswer: (choice: string) => void;
  onCallStaff: () => void;
}

export const MinigameStepView: React.FC<MinigameStepViewProps> = ({
  onAnswer,
  onCallStaff: _onCallStaff,
}) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center select-none bg-[#EDF7F1]">
      <PhysicalCardGame
        maxQuestions={10}
        onComplete={(_finalScore, _totalQuestions) => {
          onAnswer('yes');
        }}
        onExit={() => {
          onAnswer('yes');
        }}
      />
    </div>
  );
};
