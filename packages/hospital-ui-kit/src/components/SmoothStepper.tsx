/**
 * packages/hospital-ui-kit/src/components/SmoothStepper.tsx
 * Master Prompt v5 Section 2.2 #3: Smooth Stepper Pill Indicator (1 -> 2 -> 3 with fluid fill & slide-up)
 */

import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  number: number;
  label: string;
}

export interface SmoothStepperProps {
  steps: StepItem[];
  currentStep: number;
  onStepClick?: (stepNumber: number) => void;
}

export const SmoothStepper: React.FC<SmoothStepperProps> = ({
  steps,
  currentStep,
  onStepClick,
}) => {
  return (
    <div className="w-full flex items-center justify-between gap-3 py-3 select-none">
      {steps.map((step, idx) => {
        const isCompleted = step.number < currentStep;
        const isActive = step.number === currentStep;

        return (
          <React.Fragment key={step.number}>
            <div
              onClick={() => onStepClick && isCompleted && onStepClick(step.number)}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-600/25 scale-[1.02]'
                  : isCompleted
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300/60 cursor-pointer hover:bg-emerald-100'
                  : 'bg-slate-100/90 text-slate-500 border border-slate-200/80'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isActive
                    ? 'bg-white text-emerald-700 shadow-sm font-black'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : step.number}
              </div>
              <span className={`text-xs sm:text-sm tracking-normal whitespace-nowrap ${isActive ? 'text-white font-bold' : 'font-semibold'}`}>
                {step.label}
              </span>
            </div>

            {idx < steps.length - 1 && (
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out rounded-full"
                  style={{
                    width: isCompleted ? '100%' : isActive ? '50%' : '0%',
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
