import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  KioskStateMachine,
  KioskState,
  MissionContext,
  TodayCoursePlan,
} from '../../../packages/mission-engine/src/index.js';
import {
  UserProfile,
  StaffCallRecord,
  defaultApiClient,
} from '../../../packages/api-client/src/index.js';

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
import { SmartFlowController, SmartFlowStep } from './smart-flow/index.js';
import { KioskClinicalHeader } from './clinical-ui/index.js';
import { StaffLoginModal } from '../../admin/src/clinical-ui/StaffLoginModal';
import { NewPatientRegistrationModal } from '../../admin/src/clinical-ui/NewPatientRegistrationModal';
import { PatientCoursePrescriptionModal } from '../../admin/src/clinical-ui/PatientCoursePrescriptionModal';
import { ClinicalAdminShell } from '../../admin/src/clinical-ui/ClinicalAdminShell';
import { ClinicalPtShell } from '../../pt/src/clinical-ui/ClinicalPtShell';
import { normalizePatientRecord } from '../../../packages/api-client/src/index.js';
import { PatientRecordFile } from '../../../packages/smart-biometric-core/src/index.js';

export type RoleMode = 'kiosk' | 'admin' | 'pt';

function getInitialAuthState(): { mode: RoleMode; user: UserProfile | null } {
  if (typeof window === 'undefined') {
    return { mode: 'kiosk', user: null };
  }
  const path = window.location.pathname.toLowerCase();
  let storedUser: UserProfile | null = null;
  try {
    const raw =
      localStorage.getItem('drtech_user_profile') ||
      sessionStorage.getItem('drtech_user_profile');
    if (raw) {
      storedUser = JSON.parse(raw);
    }
  } catch {
    // safe
  }

  if (path.startsWith('/admin')) {
    return { mode: 'admin', user: storedUser };
  }
  if (path.startsWith('/pt')) {
    return { mode: 'pt', user: storedUser };
  }
  return { mode: 'kiosk', user: storedUser };
}

const STAFF_ASSIST_TIMEOUT_MS = 10 * 60 * 1000;

export const App: React.FC = () => {
  const initialAuth = useMemo(() => getInitialAuthState(), []);
  const [roleMode, setRoleMode] = useState<RoleMode>(initialAuth.mode);
  const [currentStaffUser, setCurrentStaffUser] = useState<UserProfile | null>(initialAuth.user);
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>([]);
  const [flowMode, setFlowMode] = useState<'smart' | 'classic'>('smart');
  const [_smartStep, setSmartStep] = useState<SmartFlowStep>('login');
  const [isStaffLoginModalOpen, setIsStaffLoginModalOpen] = useState(false);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [prescriptionPatientId, setPrescriptionPatientId] = useState<string | null>(null);
  const [directPatient, setDirectPatient] = useState<PatientRecordFile | null>(null);
  const machine = useMemo(() => new KioskStateMachine(), []);
  const [state, setState] = useState<KioskState>('IDLE');
  const [context, setContext] = useState<MissionContext>(machine.getContext());
  const [kioskId, setKioskId] = useState<string>('kiosk-01');
  const [isPairingOpen, setIsPairingOpen] = useState<boolean>(false);
  const [isPaired, setIsPaired] = useState<boolean>(true);
  const [isDetectorReady, setIsDetectorReady] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Staff-Assisted Kiosk Patient Registration States
  const [authIntent, setAuthIntent] = useState<'kiosk_patient_registration' | 'general'>('general');
  const [pendingRegistrationBiometrics, setPendingRegistrationBiometrics] = useState<any | null>(null);
  const [staffAssistRemainingSec, setStaffAssistRemainingSec] = useState<number | null>(null);
  const staffAssistWatchdogRef = useRef<number>(0);

  const handleExitStaffAssistMode = useCallback(() => {
    setStaffAssistRemainingSec(null);
    setPendingRegistrationBiometrics(null);
    setAuthIntent('general');
    setIsNewPatientModalOpen(false);
    setIsPrescriptionModalOpen(false);
    setPrescriptionPatientId(null);
    setIsStaffLoginModalOpen(false);
    defaultApiClient.setAuthToken(null);
    defaultApiClient.setUserProfile(null);
    try {
      localStorage.removeItem('drtech_user_profile');
      sessionStorage.removeItem('drtech_auth_token');
    } catch {}
    setRoleMode('kiosk');
  }, []);

  const isStaffAssistActive = staffAssistRemainingSec !== null;

  // 10-Minute Activity Watchdog Timer for Staff-Assisted Mode
  useEffect(() => {
    if (!isStaffAssistActive) return;

    staffAssistWatchdogRef.current = Date.now() + STAFF_ASSIST_TIMEOUT_MS;

    const interval = setInterval(() => {
      const remainingMs = staffAssistWatchdogRef.current - Date.now();
      const sec = Math.max(0, Math.floor(remainingMs / 1000));
      setStaffAssistRemainingSec(sec);
      if (sec <= 0) {
        clearInterval(interval);
        handleExitStaffAssistMode();
      }
    }, 1000);

    // Reset watchdog on user interaction
    const resetWatchdog = () => {
      staffAssistWatchdogRef.current = Date.now() + STAFF_ASSIST_TIMEOUT_MS;
      setStaffAssistRemainingSec(600);
    };

    window.addEventListener('pointerdown', resetWatchdog);
    window.addEventListener('keydown', resetWatchdog);
    window.addEventListener('touchstart', resetWatchdog);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pointerdown', resetWatchdog);
      window.removeEventListener('keydown', resetWatchdog);
      window.removeEventListener('touchstart', resetWatchdog);
    };
  }, [isStaffAssistActive, handleExitStaffAssistMode]);

  const handleStaffAssistedRegister = useCallback((biometrics: any) => {
    setPendingRegistrationBiometrics(biometrics);
    setAuthIntent('kiosk_patient_registration');
    setIsStaffLoginModalOpen(true);
  }, []);

  const fetchStaffCalls = useCallback(async () => {
    if (!currentStaffUser) return;
    try {
      const calls = await defaultApiClient.kiosk.listStaffCalls();
      const seen = new Set<string>();
      const deduped = (calls || []).filter((c) => {
        const id = c.id || (c as any).call_id;
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setStaffCalls(deduped);
    } catch {
      // non-blocking
    }
  }, [currentStaffUser]);

  // Check auth session & route on mount
  useEffect(() => {
    let isMounted = true;
    async function checkAuthAndRoute() {
      const path = window.location.pathname.toLowerCase();
      try {
        const rawUser = await defaultApiClient.auth.me();
        const user = (rawUser && (rawUser as any).user) ? (rawUser as any).user : rawUser;
        if (isMounted && user && (user.role || (user as any).id)) {
          setCurrentStaffUser(user);
          const role = (user.role || '').toLowerCase();
          const uname = (user.username || '').toLowerCase();
          if (path.startsWith('/admin')) {
            if (role === 'admin' || role === 'director' || uname === 'director' || uname === 'admin') {
              setRoleMode('admin');
              return;
            }
          } else if (path.startsWith('/pt')) {
            if (role === 'pt' || uname.startsWith('pt')) {
              setRoleMode('pt');
              return;
            }
          }
        }
      } catch {
        // unauthenticated or offline
      }

      if (isMounted) {
        if ((path.startsWith('/admin') || path.startsWith('/pt')) && !defaultApiClient.getAuthToken()) {
          setIsStaffLoginModalOpen(true);
        }
      }
    }

    checkAuthAndRoute();
    fetchStaffCalls();

    return () => {
      isMounted = false;
    };
  }, [fetchStaffCalls]);

  // Sync route with browser back/forward history
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const role = (currentStaffUser?.role || '').toLowerCase();
      const uname = (currentStaffUser?.username || '').toLowerCase();
      if (
        path.startsWith('/admin') &&
        currentStaffUser &&
        (role === 'admin' || role === 'director' || uname === 'director' || uname === 'admin')
      ) {
        setRoleMode('admin');
      } else if (path.startsWith('/pt') && currentStaffUser && (role === 'pt' || uname.startsWith('pt'))) {
        setRoleMode('pt');
      } else {
        setRoleMode('kiosk');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentStaffUser]);

  // Real-time SSE for staff calls in admin / pt workspaces
  useEffect(() => {
    if (roleMode === 'admin' || roleMode === 'pt') {
      const disconnect = defaultApiClient.connectEvents(
        (event) => {
          if (event.event === 'staff_call' || event.event === 'kiosk:staff_call') {
            fetchStaffCalls();
          }
        },
        () => {}
      );
      return () => {
        disconnect();
      };
    }
  }, [roleMode, fetchStaffCalls]);

  const handleStaffLogin = useCallback(
    async (credentials: { username: string; password: string }) => {
      const res = await defaultApiClient.auth.login(credentials);
      const user = res.user;
      if (user) {
        const uname = (user.username || credentials.username || '').toLowerCase();
        const role = (user.role || res.role || '').toLowerCase();

        const isAllowedStaff =
          role === 'admin' ||
          role === 'super_admin' ||
          role === 'director' ||
          uname === 'director' ||
          uname === 'admin' ||
          role === 'pt' ||
          role === 'therapist' ||
          uname.startsWith('pt');

        if (!isAllowedStaff) {
          throw new Error(
            '⛔ บัญชีนี้ไม่มีสิทธิ์ลงทะเบียนผู้ป่วยใหม่ (อนุญาตเฉพาะ Admin, Super Admin และนักกายภาพบำบัดเท่านั้น)'
          );
        }

        const fullUser: UserProfile = {
          ...user,
          username: user.username || credentials.username,
          full_name: user.full_name || (uname === 'director' ? 'ผู้อำนวยการโรงพยาบาล' : uname === 'admin' ? 'ผู้ดูแลระบบ' : 'กภ.สมชาย กายภาพดี'),
          role: (uname === 'director' ? 'director' : (user.role || (uname === 'admin' ? 'admin' : 'pt'))) as any,
        };
        setCurrentStaffUser(fullUser);
        try {
          localStorage.setItem('drtech_user_profile', JSON.stringify(fullUser));
        } catch {
          // ignore localStorage error
        }

        if (authIntent === 'kiosk_patient_registration') {
          setIsStaffLoginModalOpen(false);
          setStaffAssistRemainingSec(600); // Start 10-minute session
          setIsNewPatientModalOpen(true);
          return;
        }

        setIsStaffLoginModalOpen(false);
        await fetchStaffCalls();
        if (role === 'admin' || role === 'director' || uname === 'director' || uname === 'admin') {
          setRoleMode('admin');
          if (window.location.pathname !== '/admin') {
            window.history.pushState({ mode: 'admin' }, '', '/admin');
          }
        } else if (role === 'pt' || uname.startsWith('pt')) {
          setRoleMode('pt');
          if (window.location.pathname !== '/pt') {
            window.history.pushState({ mode: 'pt' }, '', '/pt');
          }
        } else {
          setRoleMode('kiosk');
        }
      }
    },
    [authIntent, fetchStaffCalls]
  );

  const handleStaffLogout = useCallback(async () => {
    try {
      await defaultApiClient.auth.logout();
    } catch {
      // non-blocking
    }
    try {
      localStorage.removeItem('drtech_user_profile');
      sessionStorage.removeItem('drtech_user_profile');
    } catch {
      // ignore
    }
    setCurrentStaffUser(null);
    setRoleMode('kiosk');
    if (window.location.pathname !== '/') {
      window.history.pushState({ mode: 'kiosk' }, '', '/');
    }
  }, []);

  const handleReturnToKiosk = useCallback(() => {
    setIsStaffLoginModalOpen(false);
    if (authIntent === 'kiosk_patient_registration') {
      setPendingRegistrationBiometrics(null);
      setAuthIntent('general');
    }
    setRoleMode('kiosk');
    if (window.location.pathname !== '/') {
      window.history.pushState({ mode: 'kiosk' }, '', '/');
    }
  }, [authIntent]);

  const handleOpenStaffLoginModal = useCallback(async () => {
    if (currentStaffUser) {
      const role = (currentStaffUser.role || '').toLowerCase();
      const uname = (currentStaffUser.username || '').toLowerCase();
      if (role === 'admin' || role === 'director' || uname === 'director' || uname === 'admin') {
        setRoleMode('admin');
        if (window.location.pathname !== '/admin') {
          window.history.pushState({ mode: 'admin' }, '', '/admin');
        }
        return;
      } else if (role === 'pt' || uname.startsWith('pt')) {
        setRoleMode('pt');
        if (window.location.pathname !== '/pt') {
          window.history.pushState({ mode: 'pt' }, '', '/pt');
        }
        return;
      }
    }
    setIsStaffLoginModalOpen(true);
  }, [currentStaffUser]);

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

  // Handle staff emergency call with 30s cooldown and pending guard
  const lastStaffCallTimeRef = useRef<number>(0);
  const isStaffCallPendingRef = useRef<boolean>(false);

  const handleTriggerStaffCall = useCallback(
    async (reason?: string) => {
      const now = Date.now();
      // Enforce 10-minute cooldown per kiosk and avoid concurrent calls
      if (isStaffCallPendingRef.current || (now - lastStaffCallTimeRef.current < 10 * 60 * 1000 && lastStaffCallTimeRef.current > 0)) {
        return;
      }

      isStaffCallPendingRef.current = true;
      lastStaffCallTimeRef.current = now;

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
      } finally {
        isStaffCallPendingRef.current = false;
      }
    },
    [kioskId, machine]
  );

  // Handle identity confirmation / denial
  const handleConfirmIdentity = useCallback(
    async (confirmed: boolean) => {
      if (sessionToken) {
        try {
          await defaultApiClient.kiosk.confirmIdentity(sessionToken, confirmed);
        } catch {
          // Fallback safely
        }
      }
      if (!confirmed) {
        setSessionToken(null);
      }
      machine.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed });
    },
    [sessionToken, machine]
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
  const handleFinishMission = useCallback(async () => {
    if (context.plan && context.patientId) {
      try {
        await defaultApiClient.kiosk.finishMission({
          course_id: context.plan.courseId,
        });
      } catch {
        // Finish safely
      }
    }
    machine.handleEvent({ type: 'FINISH_MISSION' });
  }, [context.plan, context.patientId, machine]);

  if (roleMode === 'admin') {
    return (
      <div className="relative w-screen h-screen overflow-hidden font-sans select-none">
        <ClinicalAdminShell
          currentUser={currentStaffUser}
          onLogout={handleStaffLogout}
          onReturnToKiosk={handleReturnToKiosk}
          onLogin={handleStaffLogin}
          staffCalls={staffCalls}
          onStaffCallHandled={fetchStaffCalls}
        />
      </div>
    );
  }

  if (roleMode === 'pt') {
    return (
      <div className="relative w-screen h-screen overflow-hidden font-sans select-none">
        <ClinicalPtShell
          currentUser={currentStaffUser}
          onLogout={handleStaffLogout}
          onReturnToKiosk={handleReturnToKiosk}
          staffCalls={staffCalls}
          onStaffCallHandled={fetchStaffCalls}
          onProfileUpdated={async () => {
            try {
              const u = await defaultApiClient.auth.me();
              if (u) setCurrentStaffUser(u);
            } catch {
              // non-blocking
            }
          }}
        />
      </div>
    );
  }

  if (flowMode === 'smart') {
    return (
      <div className="w-screen h-screen flex flex-col bg-gradient-to-b from-[#EBF5FA] via-[#F2F9FC] to-[#E6F4F8] text-slate-900 select-none overflow-hidden relative font-sans">
        <KioskClinicalHeader
          kioskId={kioskId}
          onCallStaff={() => handleTriggerStaffCall('คนไข้กดเรียกเจ้าหน้าที่จากตู้ Kiosk')}
          onOpenNewPatientModal={() => {
            setAuthIntent('kiosk_patient_registration');
            setIsStaffLoginModalOpen(true);
          }}
          onOpenStaffLoginModal={() => {
            setAuthIntent('general');
            handleOpenStaffLoginModal();
          }}
          staffAssistRemainingSec={staffAssistRemainingSec}
          onExitStaffAssistMode={handleExitStaffAssistMode}
          currentStaffUser={currentStaffUser}
        />

        <div className="flex-1 overflow-hidden relative">
          <SmartFlowController
            onStepChange={setSmartStep}
            onOpenStaffLoginModal={() => {
              setAuthIntent('general');
              handleOpenStaffLoginModal();
            }}
            onOpenNewPatientModal={() => {
              setAuthIntent('kiosk_patient_registration');
              setIsStaffLoginModalOpen(true);
            }}
            onStaffAssistedRegister={handleStaffAssistedRegister}
            isPaused={isStaffLoginModalOpen || isNewPatientModalOpen || isPrescriptionModalOpen || isPairingOpen || roleMode !== 'kiosk'}
            directPatient={directPatient}
            onClearDirectPatient={() => setDirectPatient(null)}
          />
        </div>

        {/* Staff Login Modal */}
        <StaffLoginModal
          isOpen={isStaffLoginModalOpen}
          authIntent={authIntent}
          onClose={() => {
            setIsStaffLoginModalOpen(false);
            if (authIntent === 'kiosk_patient_registration') {
              setPendingRegistrationBiometrics(null);
              setAuthIntent('general');
            }
            if (roleMode === 'kiosk' && window.location.pathname !== '/') {
              window.history.pushState({ mode: 'kiosk' }, '', '/');
            }
          }}
          onLogin={handleStaffLogin}
          onReturnToKiosk={handleReturnToKiosk}
        />

        {/* 3-Step New Patient Registration Modal */}
        <NewPatientRegistrationModal
          isOpen={isNewPatientModalOpen}
          staffUser={currentStaffUser}
          initialBiometrics={pendingRegistrationBiometrics}
          onClose={() => {
            setIsNewPatientModalOpen(false);
            if (staffAssistRemainingSec !== null) {
              handleExitStaffAssistMode();
            }
          }}
          onSuccess={(newPatientId, action) => {
            setIsNewPatientModalOpen(false);
            if (action === 'course') {
              // Reset 10-minute timeout so staff has full time to customize course
              staffAssistWatchdogRef.current = Date.now() + STAFF_ASSIST_TIMEOUT_MS;
              setStaffAssistRemainingSec(600);
              setPrescriptionPatientId(newPatientId);
              setIsPrescriptionModalOpen(true);
            } else {
              handleExitStaffAssistMode();
            }
          }}
        />

        {/* Patient Course Prescription Modal (Kiosk Mode) */}
        <PatientCoursePrescriptionModal
          isOpen={isPrescriptionModalOpen}
          kioskMode={true}
          preselectedPatientId={prescriptionPatientId || undefined}
          onClose={() => {
            setIsPrescriptionModalOpen(false);
            handleExitStaffAssistMode();
          }}
          onSuccess={async (targetPatientId, action, snapshotData) => {
            setIsPrescriptionModalOpen(false);
            if (action === 'start_exercise') {
              // Fetch target patient and transition directly to SmartDailyPlanView
              try {
                let targetRecord: any = null;
                try {
                  targetRecord = await defaultApiClient.patients.get(targetPatientId);
                } catch {
                  const dossier = await defaultApiClient.smartOnboarding.getDossier(targetPatientId);
                  targetRecord = dossier?.record;
                }
                const baseRec = targetRecord || { id: targetPatientId, hn: targetPatientId };
                if (snapshotData) {
                  baseRec.schedule = snapshotData.schedule || baseRec.schedule;
                  baseRec.activePrescriptionSnapshot = snapshotData;
                }
                const norm = normalizePatientRecord(baseRec);
                setDirectPatient(norm);
              } catch {
                const fallbackRec: any = { id: targetPatientId, hn: targetPatientId };
                if (snapshotData) {
                  fallbackRec.schedule = snapshotData.schedule;
                  fallbackRec.activePrescriptionSnapshot = snapshotData;
                }
                setDirectPatient(normalizePatientRecord(fallbackRec));
              }

              // Delay staff privilege exit slightly so initial plan hydration completes with valid credentials
              setTimeout(() => {
                handleExitStaffAssistMode();
              }, 150);
            } else {
              // Return to Kiosk home
              handleExitStaffAssistMode();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden relative">
      {/* Top Header Bar */}
      <Header
        kioskId={kioskId}
        isPaired={isPaired}
        onCallStaff={() => handleTriggerStaffCall('คนไข้กดเรียกเจ้าหน้าที่จากแถบเมนูด้านบน')}
        onOpenPairing={() => setIsPairingOpen(true)}
        onOpenStaffLoginModal={handleOpenStaffLoginModal}
      />

      <div className="absolute top-4 right-28 z-40">
        <button
          type="button"
          onClick={() => setFlowMode('smart')}
          className="px-3.5 py-1 rounded-full bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-xs font-semibold text-emerald-300 transition shadow-lg backdrop-blur-md flex items-center gap-1.5"
        >
          <span>⚡ สลับเป็น Smart Flow v4</span>
        </button>
      </div>

      {/* Main View Port (Driven strictly by Section 9 State Machine) */}
      <main className="flex-1 w-full h-[calc(100vh-5rem)] overflow-hidden relative">
        {state === 'IDLE' && (
          <IdleView
            isDetectorReady={isDetectorReady}
            onDetectorReadyChange={setIsDetectorReady}
            onStart={() => machine.handleEvent({ type: 'FACE_PRESENT' })}
            onCallStaff={() => handleTriggerStaffCall('ระบบสแกนใบหน้ายังไม่พร้อมใช้งาน ต้องการเจ้าหน้าที่')}
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
            onSuccess={(pId, fName, av, sToken) => {
              if (sToken) {
                setSessionToken(sToken);
              }
              machine.handleEvent({
                type: 'VERIFY_SUCCESS',
                patientId: pId,
                patientFirstName: fName,
                avatarUrl: av,
              });
            }}
            onFailure={(err) => machine.handleEvent({ type: 'VERIFY_FAILED', error: err })}
            onCallStaff={() => handleTriggerStaffCall('สแกนใบหน้าไม่ผ่าน ต้องการเจ้าหน้าที่ช่วยเหลือ')}
          />
        )}

        {state === 'CONFIRM' && (
          <ConfirmView
            firstName={context.patientFirstName || 'ผู้รับบริการ'}
            avatarUrl={context.avatarUrl}
            onConfirm={() => handleConfirmIdentity(true)}
            onDeny={() => handleConfirmIdentity(false)}
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
            patientId={context.patientId || `patient-${context.enrollmentTicketId || 'new'}`}
            framesCount={context.enrollmentFramesCount}
            onFrameCaptured={() => machine.handleEvent({ type: 'ENROLL_FRAME_CAPTURED' })}
            onComplete={() => machine.handleEvent({ type: 'ENROLL_COMPLETE' })}
            onCallStaff={() => handleTriggerStaffCall('การลงทะเบียนใบหน้าขัดข้อง')}
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

      {/* Staff Login Modal */}
      <StaffLoginModal
        isOpen={isStaffLoginModalOpen}
        onClose={() => {
          setIsStaffLoginModalOpen(false);
          if (roleMode === 'kiosk' && window.location.pathname !== '/') {
            window.history.pushState({ mode: 'kiosk' }, '', '/');
          }
        }}
        onLogin={handleStaffLogin}
        onReturnToKiosk={handleReturnToKiosk}
      />

      {/* 3-Step New Patient Registration Modal */}
      <NewPatientRegistrationModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(newPatientId, action) => {
          setIsNewPatientModalOpen(false);
          if (action === 'course') {
            setPrescriptionPatientId(newPatientId);
            setIsPrescriptionModalOpen(true);
          }
        }}
      />

      {/* Patient Course Prescription Modal (Classic Fallback) */}
      <PatientCoursePrescriptionModal
        isOpen={isPrescriptionModalOpen}
        kioskMode={true}
        preselectedPatientId={prescriptionPatientId || undefined}
        onClose={() => setIsPrescriptionModalOpen(false)}
        onSuccess={(_targetId) => {
          setIsPrescriptionModalOpen(false);
        }}
      />
    </div>
  );
};
