/**
 * apps/kiosk/src/smart-flow/SmartFlowController.tsx
 * Isolated Kiosk State Controller for Master Prompt v4
 * Coordinates: SmartLoginView -> SmartEnrollmentView -> SmartInfoForm -> SmartDailyPlanView
 */

import React, { useState } from 'react';
import { SmartLoginView } from './SmartLoginView';
import { SmartEnrollmentView } from './SmartEnrollmentView';
import { SmartInfoForm } from './SmartInfoForm';
import { SmartDailyPlanView } from './SmartDailyPlanView';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import { FaceDetector } from '../../../../packages/face-client/src/index.js';

export type SmartFlowStep = 'login' | 'enroll' | 'info_form' | 'daily_plan';

interface SmartFlowControllerProps {
  customDetector?: FaceDetector;
}

export const SmartFlowController: React.FC<SmartFlowControllerProps> = ({ customDetector }) => {
  const [currentStep, setCurrentStep] = useState<SmartFlowStep>('login');
  const [activePatient, setActivePatient] = useState<PatientRecordFile | null>(null);
  const [pendingPatientId, setPendingPatientId] = useState<string | null>(null);

  // 1. Login success -> Route to Daily Plan
  const handleLoginSuccess = (patient: PatientRecordFile) => {
    setActivePatient(patient);
    setCurrentStep('daily_plan');
  };

  // 2. Unrecognized face -> Route to 10-snap Enrollment
  const handleNavigateToEnroll = () => {
    setCurrentStep('enroll');
  };

  // 3. 10-snap Enrollment success -> Route to Dual-Channel Info Input
  const handleEnrollSuccess = (patientId: string) => {
    setPendingPatientId(patientId);
    setCurrentStep('info_form');
  };

  // 4. Info form completed (Option A or Option B) -> Auto reset to Welcome / Login screen
  const handleInfoCompleted = () => {
    setPendingPatientId(null);
    setCurrentStep('login');
  };

  // 5. Daily plan completed / logout -> Reset to Welcome / Login screen
  const handleLogout = () => {
    setActivePatient(null);
    setCurrentStep('login');
  };

  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden">
      {currentStep === 'login' && (
        <SmartLoginView
          onLoginSuccess={handleLoginSuccess}
          onNavigateToEnroll={handleNavigateToEnroll}
          customDetector={customDetector}
        />
      )}

      {currentStep === 'enroll' && (
        <SmartEnrollmentView
          onEnrollSuccess={handleEnrollSuccess}
          onCancel={() => setCurrentStep('login')}
          customDetector={customDetector}
        />
      )}

      {currentStep === 'info_form' && pendingPatientId && (
        <SmartInfoForm
          patientId={pendingPatientId}
          onCompleted={handleInfoCompleted}
          onCancel={() => setCurrentStep('login')}
        />
      )}

      {currentStep === 'daily_plan' && activePatient && (
        <SmartDailyPlanView
          patient={activePatient}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
};
