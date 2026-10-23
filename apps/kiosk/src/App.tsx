import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  KioskStateMachine,
  KioskState,
  MissionContext,
  TodayCoursePlan,
} from '../../../packages/mission-engine/src/index.js';
import { defaultApiClient } from '../../../packages/api-client/src/index.js';

// Components
import { Header } from './components/Header';
import { PairingModal } from './components/PairingModal';

// Views
import { IdleView } from './views/IdleView';
import { PresentView } from './views/PresentView';
import { AskAccountView } from './views/AskAccountView';
import { VerifyView } from './views/VerifyView';
import { ConfirmView } from './views/ConfirmView';
import { NoPlanView } from './views/NoPlanView';
import { ChecklistView } from './views/ChecklistView';
import { PhysioStepView } from './views/PhysioStepView';
import { MinigameStepView } from './views/MinigameStepView';
import { TickView } from './views/TickView';
import { CompleteView } from './views/CompleteView';
import { CallStaffView } from './views/CallStaffView';
import { EnrollView } from './views/EnrollView';

export const App: React.FC = () => {
  const machine = useMemo(() => new KioskStateMachine(), []);
  const [state, setState] = useState<KioskState>('IDLE');
  const [context, setContext] = useState<MissionContext>(machine.getContext());
  const [kioskId, setKioskId] = useState<string>('kiosk-01');
  const [isPairingOpen, setIsPairingOpen] = useState<boolean>(false);
  const [isPaired, setIsPaired] = useState<boolean>(true);

  // Subscribe to pure State Machine updates
  useEffect(() => {
    const unsubscribe = machine.subscribe((newState, newContext) => {
      setState(newState);
      setContext(newContext);
    });
    return () => {
      unsubscribe();
    };
  }, [machine]);

  // When state reaches LOGGED_IN, fetch plan from API
  useEffect(() => {
    if (state === 'LOGGED_IN' && context.patientId) {
      let isMounted = true;
      async function fetchPlan() {
        try {
          const res = await defaultApiClient.kiosk.getPlan(context.patientId!, kioskId);
          if (isMounted) {
            if (res && res.plan) {
              machine.handleEvent({
                type: 'PLAN_LOADED',
                plan: res.plan as TodayCoursePlan,
              });
            } else {
              machine.handleEvent({ type: 'PLAN_LOADED', plan: null });
            }
          }
        } catch {
          if (isMounted) {
            machine.handleEvent({ type: 'PLAN_LOADED', plan: null });
          }
        }
      }
      fetchPlan();
      return () => {
        isMounted = false;
      };
    }
  }, [state, context.patientId, kioskId, machine]);

  // Handle staff emergency call
  const handleTriggerStaffCall = useCallback(
    async (reason?: string) => {
      try {
        const res = await defaultApiClient.kiosk.callStaff({
          kiosk_id: kioskId,
          reason: reason || 'ผู้ป่วยต้องการความช่วยเหลือที่หน้าตู้',
        });
        const ticketId = res && res.id ? res.id : `call-${Date.now().toString().slice(-4)}`;
        machine.handleEvent({
          type: 'TRIGGER_CALL_STAFF',
          reason: reason || 'คนไข้กดเรียกเจ้าหน้าที่กายภาพบำบัด',
          ticketId,
        });
      } catch {
        machine.handleEvent({
          type: 'TRIGGER_CALL_STAFF',
          reason: 'คนไข้กดเรียกเจ้าหน้าที่กายภาพบำบัด',
          ticketId: `call-${Date.now().toString().slice(-4)}`,
        });
      }
    },
    [kioskId, machine]
  );

  // Handle exercise step complete
  const handlePhysioStepComplete = useCallback(async () => {
    if (context.plan && context.patientId) {
      const currentEx = context.plan.exercises[context.currentExerciseIndex];
      try {
        await defaultApiClient.kiosk.recordStep({
          patient_id: context.patientId,
          course_id: context.plan.courseId,
          step_type: 'exercise',
          ref_id: currentEx?.id,
          score: { reps: currentEx?.target_reps || 10, sets: currentEx?.target_sets || 3 },
        });
      } catch {
        // Record safely
      }
    }
    machine.handleEvent({ type: 'EXERCISE_STEP_DONE' });
  }, [context.plan, context.patientId, context.currentExerciseIndex, machine]);

  // Handle minigame answer
  const handleMinigameAnswer = useCallback(
    async (choice: string) => {
      if (context.plan && context.patientId) {
        try {
          await defaultApiClient.kiosk.recordStep({
            patient_id: context.patientId,
            course_id: context.plan.courseId,
            step_type: 'minigame',
            ref_id: context.minigameQuestion?.id,
            score: { choice },
          });
        } catch {
          // Record safely
        }
      }
      machine.handleEvent({ type: 'MINIGAME_ANSWER', choice });
    },
    [context.plan, context.patientId, context.minigameQuestion, machine]
  );

  // Handle finish mission
  const handleFinishMission = useCallback(
    async (painScore: number, feedback?: string) => {
      if (context.plan && context.patientId) {
        try {
          await defaultApiClient.kiosk.finishMission({
            patient_id: context.patientId,
            course_id: context.plan.courseId,
            pain_score: painScore,
            feedback,
          });
        } catch {
          // Finish safely
        }
      }
      machine.handleEvent({ type: 'FINISH_MISSION' });
    },
    [context.plan, context.patientId, machine]
  );

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Header Bar */}
      <Header
        kioskId={kioskId}
        isPaired={isPaired}
        onCallStaff={() => handleTriggerStaffCall('คนไข้กดเรียกเจ้าหน้าที่จากแถบเมนูด้านบน')}
        onOpenPairing={() => setIsPairingOpen(true)}
      />

      {/* Main View Port (Driven strictly by Section 9 State Machine) */}
      <main className="flex-1 w-full h-[calc(100vh-5rem)] overflow-hidden relative">
        {state === 'IDLE' && (
          <IdleView
            onStart={() => machine.handleEvent({ type: 'TAP_SCREEN' })}
            onSimulateFaceDetect={() => machine.handleEvent({ type: 'FACE_PRESENT' })}
          />
        )}

        {state === 'PRESENT' && (
          <PresentView onContinue={() => machine.handleEvent({ type: 'TAP_SCREEN' })} />
        )}

        {state === 'ASK_ACCOUNT' && (
          <AskAccountView
            onHasAccount={() => machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' })}
            onNoAccount={(ticketId) => machine.handleEvent({ type: 'SELECT_NO_ACCOUNT', ticketId })}
            onCallStaff={() => handleTriggerStaffCall('คนไข้ใหม่ต้องการความช่วยเหลือ')}
          />
        )}

        {state === 'VERIFY' && (
          <VerifyView
            kioskId={kioskId}
            failedCount={context.failedVerifyCount}
            errorMessage={context.errorMessage}
            onSuccess={(pId, fName, av) =>
              machine.handleEvent({
                type: 'VERIFY_SUCCESS',
                patientId: pId,
                patientFirstName: fName,
                avatarUrl: av,
              })
            }
            onFailure={(err) => machine.handleEvent({ type: 'VERIFY_FAILED', error: err })}
            onCallStaff={() => handleTriggerStaffCall('สแกนใบหน้าไม่ผ่าน ต้องการเจ้าหน้าที่ช่วยเหลือ')}
          />
        )}

        {state === 'CONFIRM' && (
          <ConfirmView
            firstName={context.patientFirstName || 'ผู้รับบริการ'}
            avatarUrl={context.avatarUrl}
            onConfirm={() => machine.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed: true })}
            onDeny={() => machine.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed: false })}
          />
        )}

        {state === 'NO_PLAN' && (
          <NoPlanView
            onReset={() => machine.handleEvent({ type: 'RESET_NOW' })}
            onCallStaff={() => handleTriggerStaffCall('คนไข้ไม่มีนัดหมายวันนี้ ต้องการสอบถาม')}
          />
        )}

        {state === 'CHECKLIST' && context.plan && (
          <ChecklistView
            plan={context.plan}
            onStart={() => machine.handleEvent({ type: 'CHECKLIST_START' })}
          />
        )}

        {state === 'STEP_PHYSIO' && context.plan && (
          <PhysioStepView
            exercise={
              context.plan.exercises[context.currentExerciseIndex] || context.plan.exercises[0]
            }
            currentIndex={context.currentExerciseIndex}
            totalExercises={context.totalExercises}
            onStepComplete={handlePhysioStepComplete}
            onCallStaff={() => handleTriggerStaffCall('ต้องการความช่วยเหลือขณะฝึกท่ากายภาพ')}
          />
        )}

        {state === 'STEP_MINIGAME' && (
          <MinigameStepView
            question={context.minigameQuestion}
            onAnswer={handleMinigameAnswer}
            onCallStaff={() => handleTriggerStaffCall('ต้องการความช่วยเหลือขณะเล่นมินิเกม')}
          />
        )}

        {state === 'TICK' && (
          <TickView onDone={() => machine.handleEvent({ type: 'TICK_FINISHED' })} />
        )}

        {state === 'COMPLETE' && (
          <CompleteView
            patientFirstName={context.patientFirstName}
            doctorNotes={context.plan?.doctorNotes}
            onFinish={handleFinishMission}
          />
        )}

        {state === 'ENROLL' && (
          <EnrollView
            ticketId={context.enrollmentTicketId}
            framesCount={context.enrollmentFramesCount}
            onFrameCaptured={() => machine.handleEvent({ type: 'ENROLL_FRAME_CAPTURED' })}
            onComplete={() => machine.handleEvent({ type: 'ENROLL_COMPLETE' })}
          />
        )}

        {state === 'CALL_STAFF' && (
          <CallStaffView
            ticketId={context.staffCallTicketId}
            errorMessage={context.errorMessage}
            onReset={() => machine.handleEvent({ type: 'RESET_NOW' })}
          />
        )}
      </main>

      {/* Terminal Pairing Modal */}
      <PairingModal
        isOpen={isPairingOpen}
        currentKioskId={kioskId}
        onClose={() => setIsPairingOpen(false)}
        onSuccess={(id) => {
          setKioskId(id);
          setIsPaired(true);
        }}
      />
    </div>
  );
};
