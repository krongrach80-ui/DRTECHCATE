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
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-emerald-50 border-2 border-emerald-500 shadow-sm text-emerald-900 font-bold scale-[1.02]'
                  : isCompleted
                  ? 'bg-slate-100/90 text-emerald-700 cursor-pointer hover:bg-slate-200'
                  : 'bg-slate-50 text-slate-400 border border-slate-200/80'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isActive
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.number}
              </div>
              <span className="text-xs tracking-tight">{step.label}</span>
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
