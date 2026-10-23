/**
 * packages/face-client/src/liveness.ts
 * Liveness & Presentation Attack Detection (PAD) per Master Prompt v3 Section 7.5
 */

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


export type ChallengeStep = 'left' | 'right' | 'nod' | 'front';

export interface ActiveChallengeState {
  currentStepIndex: number;
  steps: ChallengeStep[];
  completedSteps: ChallengeStep[];
  isComplete: boolean;
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
