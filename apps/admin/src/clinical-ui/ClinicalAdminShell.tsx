import React, { useState, useEffect, useCallback } from 'react';
import {
  ClinicalSidebar,
  ClinicalMenuId,
} from './ClinicalSidebar';
import { ClinicalTopHeader } from './ClinicalTopHeader';
import { StaffLoginModal } from './StaffLoginModal';
import { NewPatientRegistrationModal } from './NewPatientRegistrationModal';
import { ClinicalScheduleView } from './ClinicalScheduleView';

// Master Prompt v3 Spec 8.1: 6 Main Admin Windows
import { StaffView } from '../views/StaffView';
import { PatientsView } from '../views/PatientsView';
import { PtsView } from '../views/PtsView';
import { LibraryView } from '../views/LibraryView';
import { SecurityView } from '../views/SecurityView';
import { ErrorBoundary } from './ErrorBoundary';

import {
  hospitalTheme,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import {
  UserProfile,
  StaffCallRecord,
  defaultApiClient,
} from '../../../../packages/api-client/src/index.js';

interface ClinicalAdminShellProps {
  currentUser: UserProfile | null;
  onLogout: () => void;
  onReturnToKiosk?: () => void;
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
  staffCalls?: StaffCallRecord[];
  onStaffCallHandled?: () => void;
  sseConnected?: boolean;
}

export const ClinicalAdminShell: React.FC<ClinicalAdminShellProps> = ({
  currentUser,
  onLogout,
  onReturnToKiosk,
  onLogin,
  staffCalls: initialStaffCalls,
  onStaffCallHandled,
  sseConnected = false,
}) => {
  const [activeTab, setActiveTab] = useState<ClinicalMenuId>('users');
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>(initialStaffCalls || []);

  // Modals state
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchCalls = useCallback(async () => {
    if (!currentUser) return;
    try {
      const calls = await defaultApiClient.kiosk.listStaffCalls();
      setStaffCalls(calls);
    } catch {
      // non-blocking
    }
  }, [currentUser]);

  useEffect(() => {
    if (initialStaffCalls) {
      setStaffCalls(initialStaffCalls);
    } else {
      fetchCalls();
    }

    // Real-Time Multi-Device Sync via SSE
    let unsubSse: (() => void) | undefined;
    try {
      unsubSse = defaultApiClient.subscribeToEvents((_evt: { event: string; data: unknown }) => {
        fetchCalls();
      });
    } catch {
      // non-blocking
    }

    // Fallback sync polling every 12 seconds
    const syncInterval = setInterval(fetchCalls, 12000);

    return () => {
      unsubSse?.();
      clearInterval(syncInterval);
    };
  }, [initialStaffCalls, fetchCalls]);

  // Tab change (Instant, zero fake setTimeout per Rule 2.2)
  const handleSelectTab = (tab: ClinicalMenuId) => {
    setIsMobileMenuOpen(false);
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  const getPageMeta = (tab: ClinicalMenuId): { title: string; subtitle: string } => {
    switch (tab) {
      case 'users':
        return {
          title: 'จัดการผู้ใช้และบุคลากรโรงพยาบาล',
          subtitle: 'Hospital Staff & User Management Portal',
        };
      case 'patients':
        return {
          title: 'ทะเบียนประวัติและเวชระเบียนคนไข้',
          subtitle: 'Patient Directory & Electronic Health Records',
        };
      case 'pts':
        return {
          title: 'ข้อมูลนักกายภาพบำบัดและการกำกับดูแล',
          subtitle: 'Physiotherapist Directory & Clinical Governance',
        };
      case 'library':
        return {
          title: 'ท่ากายภาพ มินิเกมฝึกสมอง และ Modpack',
          subtitle: 'Exercise Library, Minigame Bank & Clinical Modpacks',
        };
      case 'schedule':
        return {
          title: 'ตารางฝึกกายภาพและปฏิทินการฟื้นฟู',
          subtitle: 'Clinical Physical Therapy Schedule Planner',
        };
      case 'audit':
        return {
          title: 'ประวัติการใช้งานและบันทึกความปลอดภัย',
          subtitle: 'Tamper-Evident System Audit Trail & Security',
        };
      default:
        return {
          title: 'ระบบบริหารโรงพยาบาล Dr.Tech.Care',
          subtitle: 'Hospital Clinical Administration Portal',
        };
    }
  };

  const pageMeta = getPageMeta(activeTab);

  return (
    <div
      id="clinical-admin-shell"
      data-testid="clinical-admin-shell"
      className="flex h-screen w-screen overflow-hidden font-sans select-none relative"
    >
      {/* Mobile Slide-Out Drawer (Only on small screens when toggled) */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 md:hidden animate-fade-in flex"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <ClinicalSidebar
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              queueBadgeCount={staffCalls.filter((c) => !c.handled_at).length}
              onLogout={onLogout}
              onReturnToKiosk={onReturnToKiosk}
            />
          </div>
        </div>
      )}

      {/* Desktop Fixed Left Sidebar (Hidden on mobile) */}
      <div className="hidden md:flex shrink-0">
        <ClinicalSidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          queueBadgeCount={staffCalls.filter((c) => !c.handled_at).length}
          onLogout={onLogout}
          onReturnToKiosk={onReturnToKiosk}
        />
      </div>

      {/* Right Main Body Layout */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Clean White Top Header Bar */}
        <ClinicalTopHeader
          title={pageMeta.title}
          subtitleEn={pageMeta.subtitle}
          userName={
            currentUser?.full_name?.trim() ||
            (currentUser?.username === 'director' ? 'ผอ. นพ. บริรักษ์ เวชกิจ' : undefined) ||
            (currentUser?.username === 'admin' ? 'ผู้ดูแลระบบ โรงพยาบาล' : undefined) ||
            currentUser?.username ||
            'ผอ. นพ. บริรักษ์ เวชกิจ'
          }
          userRoleTitle={
            currentUser?.username === 'director'
              ? 'ผู้อำนวยการโรงพยาบาล (Hospital Director)'
              : (currentUser?.role === 'admin' || currentUser?.username === 'admin')
              ? 'ผู้ดูแลระบบโรงพยาบาล (Hospital Administrator)'
              : currentUser?.role === 'pt'
              ? 'นักกายภาพบำบัด (PT)'
              : 'เจ้าหน้าที่โรงพยาบาล (Hospital Staff)'
          }
          onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
          onFastCheckIn={() => {
            setActiveTab('schedule');
          }}
          onLogout={onLogout}
          onReturnToKiosk={onReturnToKiosk}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Sterile Mint-White Main Workspace */}
        <main
          style={{
            background: hospitalTheme.colors.workspaceBg,
          }}
          className="flex-1 overflow-y-auto"
        >
          {/* Master Prompt v3 Spec 8.1: 6 Windows */}
          <ErrorBoundary key={activeTab} moduleName={pageMeta.title}>
            {activeTab === 'users' && <StaffView />}
            {activeTab === 'patients' && <PatientsView />}
            {activeTab === 'pts' && <PtsView />}
            {activeTab === 'library' && <LibraryView />}
            {activeTab === 'schedule' && <ClinicalScheduleView />}
            {activeTab === 'audit' && (
              <SecurityView
                staffCalls={staffCalls}
                onStaffCallHandled={onStaffCallHandled || fetchCalls}
                sseConnected={sseConnected}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Staff Login Modal */}
      <StaffLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLogin={onLogin}
        onReturnToKiosk={onReturnToKiosk}
      />

      {/* 3-Step New Patient Registration Modal */}
      <NewPatientRegistrationModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(_newPatientId) => {
          setActiveTab('patients');
        }}
      />
    </div>
  );
};
