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
  PatientCoursePrescriptionModal,
  ErrorBoundary,
} from '../../../admin/src/clinical-ui/index.js';

// Master Prompt v3 Spec 8.2: 6 PT Views
import { ReceptionView } from '../views/ReceptionView';
import { MyPatientsView } from '../views/MyPatientsView';
import { ClinicalRecordsView } from '../views/ClinicalRecordsView';
import { ExerciseCatalogView } from '../views/ExerciseCatalogView';
import { PtScheduleView } from '../views/PtScheduleView';
import { ProfileView } from '../views/ProfileView';
import { PhysicalCardGame } from '../../../kiosk/src/minigame-cards/index.js';

import {
  hospitalTheme,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import {
  UserProfile,
  StaffCallRecord,
  PatientRecord,
  filterActiveStaffCalls,
  defaultApiClient,
} from '../../../../packages/api-client/src/index.js';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

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

  const { activeCalls } = React.useMemo(() => {
    return filterActiveStaffCalls(staffCalls);
  }, [staffCalls]);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [prescriptionPatientId, setPrescriptionPatientId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPhysicalCardGameOpen, setIsPhysicalCardGameOpen] = useState(false);
  const [schedulePreselectedPatientId, setSchedulePreselectedPatientId] = useState<string | undefined>(undefined);

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

  const { lang, t } = useClinicalI18n();

  const getPageMeta = (tab: ClinicalMenuId): { title: string; subtitle: string } => {
    const isEn = lang === 'en-US';
    const isZh = lang === 'zh-CN';

    switch (tab) {
      case 'reception':
        return {
          title: isZh ? '接待台与就诊排队' : isEn ? 'Reception & Active Kiosk Queue' : 'หน้าต้อนรับและคิวแจ้งเตือนคนไข้',
          subtitle: 'Reception & Active Kiosk Queue',
        };
      case 'patients':
        return {
          title: isZh ? '责任患者与康复计划' : isEn ? 'Assigned Patients & Care Plans' : 'คนไข้ในความรับผิดชอบและการวางแผนฟื้นฟู',
          subtitle: 'Assigned Patients & Care Plans',
        };
      case 'records':
        return {
          title: isZh ? '患者病历与交接转介' : isEn ? 'Clinical Health Records & Case Handover' : 'ข้อมูลคนไข้ เวชระเบียน และการฝากเคส',
          subtitle: 'Clinical Health Records & Case Handover',
        };
      case 'schedule':
        return {
          title: isZh ? '康复排班与每日预约' : isEn ? 'Physical Therapy Schedule & Appointments' : 'ตารางฝึกกายภาพและคิวนัดหมายประจำวัน',
          subtitle: 'Physical Therapy Schedule & Daily Appointments',
        };
      case 'exercises':
        return {
          title: isZh ? '康复动作库与处方' : isEn ? 'Exercise Catalog & Prescriptions' : 'คลังท่ากายภาพบำบัดและการประเมิน',
          subtitle: 'Exercise Catalog & Prescriptions',
        };
      case 'profile':
        return {
          title: isZh ? '物理治疗师个人信息' : isEn ? 'Therapist Profile & Credentials' : 'ข้อมูลส่วนตัวของนักกายภาพบำบัด',
          subtitle: 'Therapist Profile & Credentials',
        };
      default:
        return {
          title: isZh ? 'Dr.Tech.Care 康复管理系统' : isEn ? 'Dr.Tech.Care Physical Therapy Portal' : 'ระบบบริหารกายภาพบำบัด Dr.Tech.Care',
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
              queueBadgeCount={activeCalls.length}
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
          queueBadgeCount={activeCalls.length}
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
          avatarUrl={currentUser?.avatar_url}
          userRoleTitle={
            lang === 'zh-CN'
              ? '主任物理治疗师 (Senior Physical Therapist)'
              : lang === 'en-US'
              ? 'Senior Physical Therapist'
              : 'นักกายภาพบำบัดวิชาชีพ (Senior Physical Therapist)'
          }
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
                onPrescribeCourse={(p: PatientRecord) => {
                  setPrescriptionPatientId(p.id || p.hn);
                  setIsPrescriptionModalOpen(true);
                }}
              />
            )}
            {activeTab === 'records' && (
              <ClinicalRecordsView initialPatientId={activeRecordsPatientId} currentUserId={currentUserId} />
            )}
            {activeTab === 'schedule' && (
              <PtScheduleView
                currentUserId={currentUserId}
                preselectedPatientId={schedulePreselectedPatientId}
              />
            )}
            {activeTab === 'exercises' && (
              <ExerciseCatalogView
                currentUserId={currentUserId}
                onOpenPrescription={() => {
                  setPrescriptionPatientId(null);
                  setIsPrescriptionModalOpen(true);
                }}
              />
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
                  if (patientId) {
                    if (tab === 'schedule') {
                      setSchedulePreselectedPatientId(patientId);
                    } else {
                      setActiveRecordsPatientId(patientId);
                    }
                  }
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

      {/* Patient Course Prescription Modal (PT Portal) */}
      <PatientCoursePrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
        preselectedPatientId={prescriptionPatientId || undefined}
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

      {/* Floating Quick Launcher for Physical Cards Minigame in PT Admin (Docked neatly at bottom-right) */}
      <button
        type="button"
        id="pt-physical-cards-btn"
        onClick={() => setIsPhysicalCardGameOpen(true)}
        className="fixed bottom-3 right-4 z-20 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 border border-white/30 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md opacity-90 hover:opacity-100"
        title="เปิดแบบฝึกหัดการ์ดกายภาพ (10 ข้อ/รอบ)"
      >
        <span className="text-sm">🎮</span>
        <span>การ์ดกายภาพ (10 ข้อ/รอบ)</span>
      </button>

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
