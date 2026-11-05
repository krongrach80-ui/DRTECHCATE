/**
 * apps/kiosk/src/smart-flow/SmartFlowController.tsx
 * Isolated Kiosk State Controller for Master Prompt v4
 * Coordinates: SmartLoginView -> SmartEnrollmentView -> SmartInfoForm -> SmartDailyPlanView
 */

import React, { useState, useEffect } from 'react';
import { SmartLoginView } from './SmartLoginView';
import { SmartEnrollmentView } from './SmartEnrollmentView';
import { SmartInfoForm } from './SmartInfoForm';
import { SmartDailyPlanView } from './SmartDailyPlanView';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import { FaceDetector } from '../../../../packages/face-client/src/index.js';
import { ClinicalErrorBoundary } from '../../../../packages/hospital-ui-kit/src/index';

export type SmartFlowStep = 'login' | 'enroll' | 'info_form' | 'daily_plan';

interface SmartFlowControllerProps {
  customDetector?: FaceDetector;
  onOpenStaffLoginModal?: () => void;
  onOpenNewPatientModal?: () => void;
  onStaffAssistedRegister?: (biometrics: any) => void;
  onStepChange?: (step: SmartFlowStep) => void;
  isPaused?: boolean;
  directPatient?: PatientRecordFile | null;
  onClearDirectPatient?: () => void;
}

export const SmartFlowController: React.FC<SmartFlowControllerProps> = ({
  customDetector,
  onOpenStaffLoginModal,
  onOpenNewPatientModal,
  onStaffAssistedRegister,
  onStepChange,
  isPaused,
  directPatient,
  onClearDirectPatient,
}) => {
  const [currentStep, setCurrentStep] = useState<SmartFlowStep>('login');
  const [activePatient, setActivePatient] = useState<PatientRecordFile | null>(null);
  const [pendingPatientId, setPendingPatientId] = useState<string | null>(null);

  const changeStep = (nextStep: SmartFlowStep) => {
    setCurrentStep(nextStep);
    onStepChange?.(nextStep);
  };

  // Direct login trigger (e.g. from Course Prescription "เริ่มฝึกทันที")
  useEffect(() => {
    if (directPatient) {
      setActivePatient(directPatient);
      setCurrentStep('daily_plan');
      onStepChange?.('daily_plan');
    }
  }, [directPatient, onStepChange]);

  // 1. Login success -> Route to Daily Plan
  const handleLoginSuccess = (patient: PatientRecordFile) => {
    setActivePatient(patient);
    changeStep('daily_plan');
  };

  // 2. Unrecognized face -> Route to 10-snap Enrollment
  const handleNavigateToEnroll = () => {
    changeStep('enroll');
  };

  // 3. 10-snap Enrollment success -> Route to Dual-Channel Info Input
  const handleEnrollSuccess = (patientId: string) => {
    setPendingPatientId(patientId);
    changeStep('info_form');
  };

  // 4. Info form completed (Option A or Option B) -> Auto reset to Welcome / Login screen
  const handleInfoCompleted = () => {
    setPendingPatientId(null);
    changeStep('login');
  };

  // 5. Daily plan completed / logout -> Reset to Welcome / Login screen
  const handleLogout = () => {
    setActivePatient(null);
    onClearDirectPatient?.();
    changeStep('login');
  };

  return (
    <ClinicalErrorBoundary
      fallbackTitle="เกิดข้อผิดพลาดในระบบบริการคนไข้ Kiosk"
      onReset={() => changeStep('login')}
      onExit={() => changeStep('login')}
    >
      <div className="w-full h-full bg-transparent overflow-x-hidden overflow-y-auto">
        {currentStep === 'login' && (
          <SmartLoginView
            onLoginSuccess={handleLoginSuccess}
            onNavigateToEnroll={handleNavigateToEnroll}
            customDetector={customDetector}
            onOpenStaffLoginModal={onOpenStaffLoginModal}
            onOpenNewPatientModal={onOpenNewPatientModal}
            onStaffAssistedRegister={onStaffAssistedRegister}
            isPaused={isPaused}
          />
        )}

        {currentStep === 'enroll' && (
          <SmartEnrollmentView
            onEnrollSuccess={handleEnrollSuccess}
            onCancel={() => changeStep('login')}
            customDetector={customDetector}
          />
        )}

        {currentStep === 'info_form' && pendingPatientId && (
          <SmartInfoForm
            patientId={pendingPatientId}
            onCompleted={handleInfoCompleted}
            onCancel={() => changeStep('login')}
          />
        )}

        {currentStep === 'daily_plan' && activePatient && (
          <SmartDailyPlanView
            patient={activePatient}
            onLogout={handleLogout}
          />
        )}
      </div>
    </ClinicalErrorBoundary>
  );
};
