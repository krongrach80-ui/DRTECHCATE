/**
 * apps/pt/src/App.tsx
 *
 * DRTECH.CARE PHYSICAL THERAPY PORTAL APPLICATION
 * SaMD Class II & Strict Typing Hardening:
 * - Powered by PTStateProvider & AuthGuard
 * - Client-side Declarative Routing (Zero window.location.href hard reloads)
 * - Inactivity Auto-Lock & Session Guard
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StaffCallRecord,
  defaultApiClient,
} from '../../../packages/api-client/src/index.js';
import { ClinicalPtShell } from './clinical-ui/index.js';
import { PTStateProvider, usePTState, spaNavigate } from './auth/PTStateProvider';
import { AuthGuard } from './auth/AuthGuard';

const PtAppContent: React.FC = () => {
  const { currentUser, logout, refreshToken } = usePTState();
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>([]);

  // Fetch initial staff calls
  const fetchStaffCalls = useCallback(async () => {
    try {
      const calls = await defaultApiClient.kiosk.listStaffCalls();
      setStaffCalls(calls);
    } catch {
      // offline or no permissions
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchStaffCalls();
    }
  }, [currentUser, fetchStaffCalls]);

  // Connect SSE stream for real-time live events
  useEffect(() => {
    if (!currentUser) return;

    const cleanup = defaultApiClient.connectEvents(
      (event) => {
        if (event.event === 'kiosk:staff_call') {
          fetchStaffCalls();
        }
      },
      () => {}
    );

    return () => {
      cleanup();
    };
  }, [currentUser, fetchStaffCalls]);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="relative w-screen h-screen">
      <ClinicalPtShell
        currentUser={currentUser}
        onLogout={logout}
        onReturnToKiosk={() => spaNavigate('/')}
        staffCalls={staffCalls}
        onStaffCallHandled={fetchStaffCalls}
        onProfileUpdated={refreshToken}
      />
    </div>
  );
};

export const PtApp: React.FC = () => {
  return (
    <PTStateProvider>
      <AuthGuard>
        <PtAppContent />
      </AuthGuard>
    </PTStateProvider>
  );
};

export const App = PtApp;
