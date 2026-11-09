import React, { useState, useEffect, useCallback } from 'react';
import {
  ClinicalSidebar,
  ClinicalMenuId,
} from './ClinicalSidebar';
import { ClinicalTopHeader } from './ClinicalTopHeader';
import { StaffLoginModal } from './StaffLoginModal';
import { NewPatientRegistrationModal } from './NewPatientRegistrationModal';
import { PatientCoursePrescriptionModal } from './PatientCoursePrescriptionModal';
import { ClinicalScheduleView } from './ClinicalScheduleView';

// Master Prompt v3 Spec 8.1: 6 Main Admin Windows
import { StaffView } from '../views/StaffView';
import { PatientsView } from '../views/PatientsView';
import { PtsView } from '../views/PtsView';
import { LibraryView } from '../views/LibraryView';
import { SecurityView } from '../views/SecurityView';
import { ErrorBoundary } from './ErrorBoundary';
import { PhysicalCardGame } from '../../../kiosk/src/minigame-cards/index.js';

import {
  hospitalTheme,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import {
  UserProfile,
  StaffCallRecord,
  filterActiveStaffCalls,
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
  isLoggingOut?: boolean;
}

export const ClinicalAdminShell: React.FC<ClinicalAdminShellProps> = ({
  currentUser,
  onLogout,
  onReturnToKiosk,
  onLogin,
  staffCalls: initialStaffCalls,
  onStaffCallHandled,
  sseConnected = false,
  isLoggingOut = false,
}) => {
  const [activeTab, setActiveTab] = useState<ClinicalMenuId>('users');
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>(initialStaffCalls || []);

  const { activeCalls } = React.useMemo(() => {
    return filterActiveStaffCalls(staffCalls);
  }, [staffCalls]);

  // Modals state
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [prescriptionPatientId, setPrescriptionPatientId] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPhysicalCardGameOpen, setIsPhysicalCardGameOpen] = useState(false);
  const [schedulePreselectedPatientId, setSchedulePreselectedPatientId] = useState<string | undefined>(undefined);
  const [autoOpenScheduleWizard, setAutoOpenScheduleWizard] = useState<boolean>(false);

  useEffect(() => {
    const handleClinicalNavigate = (e: Event) => {
      const customEvt = e as CustomEvent<{ tab: ClinicalMenuId; patientId?: string }>;
      if (customEvt.detail) {
        const { tab, patientId } = customEvt.detail;
        if (tab === 'schedule') {
          if (patientId) setSchedulePreselectedPatientId(patientId);
          setActiveTab('schedule');
        } else if (tab === 'patients') {
          setActiveTab('patients');
        } else if (tab) {
          setActiveTab(tab);
        }
      }
    };
    window.addEventListener('clinical-navigate', handleClinicalNavigate);
    return () => {
      window.removeEventListener('clinical-navigate', handleClinicalNavigate);
    };
  }, []);

  const fetchCalls = useCallback(async () => {
    if (!currentUser) return;
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
  }, [currentUser]);

  useEffect(() => {
    // When Physical Card Game modal is open, pause background polling and SSE
    // to give full CPU resources to the real-time hand vision detector and eliminate lag
    if (isPhysicalCardGameOpen) {
      return;
    }

    if (initialStaffCalls) {
      const seen = new Set<string>();
      const deduped = initialStaffCalls.filter((c) => {
        const id = c.id || (c as any).call_id;
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setStaffCalls(deduped);
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
  }, [initialStaffCalls, fetchCalls, isPhysicalCardGameOpen]);

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
              queueBadgeCount={activeCalls.length}
              onLogout={onLogout}
              onReturnToKiosk={onReturnToKiosk}
              isLoggingOut={isLoggingOut}
              onOpenMinigames={() => {
                setIsMobileMenuOpen(false);
                setIsPhysicalCardGameOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Desktop Fixed Left Sidebar (Hidden on mobile) */}
      <div className="hidden md:flex shrink-0">
        <ClinicalSidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          queueBadgeCount={activeCalls.length}
          onLogout={onLogout}
          onReturnToKiosk={onReturnToKiosk}
          isLoggingOut={isLoggingOut}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onOpenMinigames={() => setIsPhysicalCardGameOpen(true)}
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
          isLoggingOut={isLoggingOut}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Real-time High-Priority Emergency Pain Alert Banner */}
        {activeCalls.filter((c) => c.reason?.includes('เจ็บ') || c.reason?.includes('🚨')).length > 0 && (
          <div className="bg-rose-600 text-white px-6 py-3 flex items-center justify-between shadow-lg animate-pulse z-30">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded bg-white text-rose-700 font-black text-xs uppercase tracking-wider">
                EMERGENCY PAIN STOP
              </span>
              <span className="text-sm font-bold">
                {activeCalls.find((c) => c.reason?.includes('เจ็บ') || c.reason?.includes('🚨'))?.reason}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('audit')}
              className="px-4 py-1.5 bg-white text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition shadow cursor-pointer whitespace-nowrap"
            >
              ดูรายละเอียดใน Audit Trail / จัดการเคส ➔
            </button>
          </div>
        )}

        {/* Sterile Mint-White Main Workspace */}
        <main
          style={{
            background: hospitalTheme.colors.workspaceBg,
          }}
          className="flex-1 overflow-y-auto pt-2"
        >
          {/* Master Prompt v3 Spec 8.1: 6 Windows */}
          <ErrorBoundary key={activeTab} moduleName={pageMeta.title}>
            {activeTab === 'users' && <StaffView />}
            {activeTab === 'patients' && (
              <PatientsView
                onNavigateToTab={(tab, patientId) => {
                  if (tab === 'schedule') {
                    if (patientId) setSchedulePreselectedPatientId(patientId);
                    setActiveTab('schedule');
                  } else if (tab) {
                    setActiveTab(tab);
                  }
                }}
              />
            )}
            {activeTab === 'pts' && <PtsView />}
            {activeTab === 'library' && (
              <LibraryView
                onNavigateToTab={(tab, patientId) => {
                  if (tab === 'schedule') {
                    if (patientId) setSchedulePreselectedPatientId(patientId);
                    setActiveTab('schedule');
                  } else if (tab) {
                    setActiveTab(tab);
                  }
                }}
              />
            )}
            {activeTab === 'schedule' && (
              <ClinicalScheduleView
                preselectedPatientId={schedulePreselectedPatientId}
                autoOpenWizard={autoOpenScheduleWizard}
                onOpenCreateScheduleModal={() => setAutoOpenScheduleWizard(false)}
                onNavigateToTab={(tab) => {
                  setActiveTab(tab);
                }}
              />
            )}
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
        mode="admin"
        staffUser={currentUser}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(newPatientId, action) => {
          setIsNewPatientModalOpen(false);
          if (action === 'course') {
            setPrescriptionPatientId(newPatientId);
            setIsPrescriptionModalOpen(true);
          } else {
            setActiveTab('patients');
          }
        }}
      />

      {/* Patient Course Prescription Modal (Entry Point 1 from Registration) */}
      <PatientCoursePrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
        preselectedPatientId={prescriptionPatientId}
        onSuccess={(_targetId, action) => {
          setIsPrescriptionModalOpen(false);
          if (action === 'schedule') {
            if (_targetId) setSchedulePreselectedPatientId(_targetId);
            setActiveTab('schedule');
          } else {
            setActiveTab('patients');
          }
        }}
      />

      {/* Physical Cards Minigame Modal */}
      {isPhysicalCardGameOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-2 sm:p-4 lg:p-6">
          <div className="w-full max-w-5xl xl:max-w-6xl h-[94vh] max-h-[96vh] bg-[#EDF7F1] rounded-3xl overflow-hidden shadow-2xl relative border-2 border-emerald-500/40">
            <PhysicalCardGame maxQuestions={10} onExit={() => setIsPhysicalCardGameOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
