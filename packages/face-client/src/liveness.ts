/**
 * packages/face-client/src/liveness.ts
 * Liveness & Presentation Attack Detection (PAD) per Master Prompt v3 Section 7.5
 */

import { RequiredPose } from './quality';

export interface PadResult {
  isLive: boolean;
  score: number;
  confidence?: number;
}

export interface PadProvider {
  name: string;
  mode: 'active_only' | 'passive_only' | 'active_plus_passive';
  checkLiveness(frame: HTMLCanvasElement | ImageData | unknown): Promise<PadResult>;
}

export type ChallengeStep = RequiredPose;

export interface ActiveChallengeState {
  currentStepIndex: number;
  steps: ChallengeStep[];
  completedSteps: ChallengeStep[];
  isComplete: boolean;
}

/**
 * Passive PAD Provider fallback / mock
 */
export class PassivePadProvider implements PadProvider {
  public readonly name = 'passive-pad-provider';
  public readonly mode = 'active_plus_passive';

  constructor(private mockScore: number = 0.98) {}

  public async checkLiveness(_frame: HTMLCanvasElement | ImageData | unknown): Promise<PadResult> {
    return {
      isLive: this.mockScore >= 0.5,
      score: this.mockScore,
      confidence: 0.95,
    };
  }
}

export class ActiveChallengeTracker {
  private currentStepIndex: number = 0;
  private completedSteps: ChallengeStep[] = [];

  constructor(private steps: ChallengeStep[]) {}

  public getCurrentStep(): ChallengeStep | null {
    if (this.currentStepIndex >= this.steps.length) {
      return null;
    }
    return this.steps[this.currentStepIndex];
  }

  public completeCurrentStep(): boolean {
    if (this.currentStepIndex < this.steps.length) {
      this.completedSteps.push(this.steps[this.currentStepIndex]);
      this.currentStepIndex++;
      return true;
    }
    return false;
  }

  public isComplete(): boolean {
    return this.currentStepIndex >= this.steps.length;
  }

  public getState(): ActiveChallengeState {
    return {
      currentStepIndex: this.currentStepIndex,
      steps: [...this.steps],
      completedSteps: [...this.completedSteps],
      isComplete: this.isComplete(),
    };
  }
}

/**
 * Returns user-friendly Thai guidance instruction for each pose / challenge step.
 */
export function getThaiPoseInstruction(pose: RequiredPose): string {
  switch (pose) {
    case 'front':
      return 'มองตรงที่กล้องและยิ้มเล็กน้อย';
    case 'left':
      return 'ค่อยๆ หันศีรษะไปทางซ้าย';
    case 'right':
      return 'ค่อยๆ หันศีรษะไปทางขวา';
    case 'nod':
      return 'พยักหน้าลงช้าๆ';
    default:
      return 'มองตรงที่กล้อง';
  }
}
