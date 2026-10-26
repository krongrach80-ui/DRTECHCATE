/**
 * apps/pt/src/clinical-ui/ClinicalPtShell.tsx
 * Master Prompt v3 Spec 8.2 & Master Prompt v5: PT Clinical Emerald Presentation Shell
 * Strictly Isolated: 5 Windows + Reception View. PT CANNOT view/edit other PTs' profiles.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClinicalSidebar,
  ClinicalMenuId,
  ClinicalTopHeader,
  NewPatientRegistrationModal,
  ErrorBoundary,
} from '../../../admin/src/clinical-ui/index.js';

// Master Prompt v3 Spec 8.2: 6 PT Views
import { ReceptionView } from '../views/ReceptionView';
import { MyPatientsView } from '../views/MyPatientsView';
import { ClinicalRecordsView } from '../views/ClinicalRecordsView';
import { ExerciseCatalogView } from '../views/ExerciseCatalogView';
import { PtScheduleView } from '../views/PtScheduleView';
import { ProfileView } from '../views/ProfileView';

import {
  hospitalTheme,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import {
  UserProfile,
  StaffCallRecord,
  PatientRecord,
  defaultApiClient,
} from '../../../../packages/api-client/src/index.js';

interface ClinicalPtShellProps {
  currentUser: UserProfile | null;
  onLogout: () => void;
  onReturnToKiosk?: () => void;
  staffCalls?: StaffCallRecord[];
  onStaffCallHandled?: () => void;
  onProfileUpdated?: () => void;
}

export const ClinicalPtShell: React.FC<ClinicalPtShellProps> = ({
  currentUser,
  onLogout,
  onReturnToKiosk,
  staffCalls: initialStaffCalls,
  onStaffCallHandled,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<ClinicalMenuId>('reception');
  const [activeRecordsPatientId, setActiveRecordsPatientId] = useState<string | undefined>(undefined);
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>(initialStaffCalls || []);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentUserId = currentUser?.id || 'pt-01';

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
      case 'reception':
        return {
          title: 'หน้าต้อนรับและคิวแจ้งเตือนคนไข้',
          subtitle: 'Reception & Active Kiosk Queue',
        };
      case 'patients':
        return {
          title: 'คนไข้ในความรับผิดชอบและการวางแผนฟื้นฟู',
          subtitle: 'Assigned Patients & Care Plans',
        };
      case 'records':
        return {
          title: 'ข้อมูลคนไข้ เวชระเบียน และการฝากเคส',
          subtitle: 'Clinical Health Records & Case Handover',
        };
      case 'schedule':
        return {
          title: 'ตารางฝึกกายภาพและคิวนัดหมายประจำวัน',
          subtitle: 'Physical Therapy Schedule & Daily Appointments',
        };
      case 'exercises':
        return {
          title: 'คลังท่ากายภาพบำบัดและการประเมิน',
          subtitle: 'Exercise Catalog & Prescriptions',
        };
      case 'profile':
        return {
          title: 'ข้อมูลส่วนตัวของนักกายภาพบำบัด',
          subtitle: 'Therapist Profile & Credentials',
        };
      default:
        return {
          title: 'ระบบบริหารกายภาพบำบัด Dr.Tech.Care',
          subtitle: 'Physical Therapy Clinical Portal',
        };
    }
  };

  const pageMeta = getPageMeta(activeTab);

  return (
    <div
      id="clinical-pt-shell"
      data-testid="clinical-pt-shell"
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
              isPtMode={true}
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
          isPtMode={true}
        />
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <ClinicalTopHeader
          title={pageMeta.title}
          subtitleEn={pageMeta.subtitle}
          userName={currentUser?.full_name || 'กภ. วิภาวี สุขใจ'}
          userRoleTitle="นักกายภาพบำบัดวิชาชีพ (Senior Physical Therapist)"
          onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
          onFastCheckIn={() => {
            setActiveTab('schedule');
          }}
          onLogout={onLogout}
          onReturnToKiosk={onReturnToKiosk}
          isPtMode={true}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        <main
          style={{
            background: hospitalTheme.colors.workspaceBg,
          }}
          className="flex-1 overflow-y-auto"
        >
          {/* Master Prompt v3 Spec 8.2: 5 Windows + Reception */}
          <ErrorBoundary key={activeTab} moduleName={pageMeta.title}>
            {activeTab === 'reception' && (
              <ReceptionView
                staffCalls={staffCalls}
                onStaffCallHandled={onStaffCallHandled || fetchCalls}
                currentUserId={currentUserId}
              />
            )}
            {activeTab === 'patients' && (
              <MyPatientsView
                currentUserId={currentUserId}
                onOpenRecords={(p: PatientRecord) => {
                  setActiveRecordsPatientId(p.id);
                  setActiveTab('records');
                }}
              />
            )}
            {activeTab === 'records' && (
              <ClinicalRecordsView initialPatientId={activeRecordsPatientId} />
            )}
            {activeTab === 'schedule' && (
              <PtScheduleView currentUserId={currentUserId} />
            )}
            {activeTab === 'exercises' && (
              <ExerciseCatalogView currentUserId={currentUserId} />
            )}
            {activeTab === 'profile' && (
              <ProfileView
                currentUser={
                  currentUser || {
                    id: currentUserId,
                    username: 'pt_somchai',
                    full_name: 'กภ.สมชาย กายภาพดี',
                    role: 'pt',
                    status: 'active',
                    pt_details: {
                      license_no: 'วภ. 9876',
                      specialty: 'เวชศาสตร์ฟื้นฟูกระดูกและระบบประสาท',
                    },
                  }
                }
                onProfileUpdated={onProfileUpdated || (() => {})}
                onNavigateToTab={(tab, patientId) => {
                  if (patientId) setActiveRecordsPatientId(patientId);
                  setActiveTab(tab);
                }}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      <NewPatientRegistrationModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(_id) => {
          setActiveTab('patients');
        }}
      />
    </div>
  );
};
