/**
 * apps/admin/src/clinical-ui/ClinicalScheduleView.tsx
 * Master Prompt v6 Section 4: Clinical Schedule Planner, Dynamic Overview Weekly/Monthly Schedule Grid & 4 KPI Cards
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  User,
  Activity,
  CheckCircle2,
  PauseCircle,
  Brain,
  Monitor,
} from 'lucide-react';
import {
  MedicalCard,
  StatusBadge,
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { defaultApiClient, PatientRecord } from '../../../../packages/api-client/src/index.js';
import { SmartScheduleWizardModal } from '../smart-portal/SmartScheduleWizardModal';

interface ClinicalScheduleViewProps {
  onOpenCreateScheduleModal?: (patientId?: string) => void;
}

const DEMO_PATIENTS: PatientRecord[] = [];
const DEMO_DOSSIERS: any[] = [];

export const ClinicalScheduleView: React.FC<ClinicalScheduleViewProps> = ({
  onOpenCreateScheduleModal,
}) => {
  const [calendarMode, setCalendarMode] = useState<'individual' | 'all'>('individual');
  const [patients, setPatients] = useState<PatientRecord[]>(DEMO_PATIENTS);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [dossiers, setDossiers] = useState<
    Array<{
      patient_id: string;
      first_name: string;
      last_name: string;
      hn: string;
      profile_face_url: string;
      schedule: any;
      rehab_scores: any[];
      clinical?: any;
    }>
  >(DEMO_DOSSIERS);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardPatientId, setWizardPatientId] = useState<string | undefined>(undefined);

  // Dynamic current month state
  const now = useMemo(() => new Date(), []);
  const [currentYear] = useState(now.getFullYear());
  const [currentMonthIndex] = useState(now.getMonth());

  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [list, dossierList] = await Promise.all([
        defaultApiClient.patients.list().catch(() => []),
        defaultApiClient.smartOnboarding.listDossiers().catch(() => []),
      ]);
      const patientArr = Array.isArray(list) && list.length > 0 ? list : DEMO_PATIENTS;
      const dossierArr = Array.isArray(dossierList) && dossierList.length > 0 ? dossierList : DEMO_DOSSIERS;
      setPatients(patientArr);
      setDossiers(dossierArr);
      setSelectedPatient((prev) => prev ?? patientArr[0]);
    } catch {
      setPatients(DEMO_PATIENTS);
      setDossiers(DEMO_DOSSIERS);
      setSelectedPatient((prev) => prev ?? DEMO_PATIENTS[0]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const handleScheduleUpdated = () => {
      void loadData();
    };
    window.addEventListener('schedule-updated', handleScheduleUpdated);
    return () => {
      window.removeEventListener('schedule-updated', handleScheduleUpdated);
    };
  }, [loadData]);

  const handleOpenWizard = (patientId?: string) => {
    const targetId = patientId || selectedPatient?.id;
    setWizardPatientId(targetId);
    setIsWizardOpen(true);
    onOpenCreateScheduleModal?.(targetId);
  };

  // Dynamic calendar dates generation
  const daysOfWeek = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayOffset = new Date(currentYear, currentMonthIndex, 1).getDay();

  const dayAliases: Record<string, string[]> = useMemo(
    () => ({
      Sun: ['Sun', 'อาทิตย์', 'อา.'],
      Mon: ['Mon', 'จันทร์', 'จ.'],
      Tue: ['Tue', 'อังคาร', 'อ.'],
      Wed: ['Wed', 'พุธ', 'พ.'],
      Thu: ['Thu', 'พฤหัสบดี', 'พฤ.'],
      Fri: ['Fri', 'ศุกร์', 'ศ.'],
      Sat: ['Sat', 'เสาร์', 'ส.'],
    }),
    []
  );

  // Selected patient's active dossier and schedule
  const activeDossier = useMemo(() => {
    if (!selectedPatient) return null;
    return (
      dossiers.find(
        (d) =>
          d.patient_id === selectedPatient.id ||
          d.hn === selectedPatient.hn ||
          d.patient_id === (selectedPatient as any).patient_id
      ) || null
    );
  }, [dossiers, selectedPatient]);

  // Compute daily schedule for each day of the month
  const monthlyScheduleMap = useMemo(() => {
    const map = new Map<
      number,
      {
        hasSession: boolean;
        isToday: boolean;
        isPaused: boolean;
        isCompleted: boolean;
        timeSlot: string;
        kioskId: string;
        exerciseCount: number;
        includeMinigame: boolean;
        dateRangeStr: string;
        matchingSessions: Array<{
          patientName: string;
          hn: string;
          timeSlot: string;
          kioskId: string;
          includeMinigame: boolean;
        }>;
      }
    >();

    const todayDate = new Date();
    const todayYear = todayDate.getFullYear();
    const todayMonth = todayDate.getMonth();
    const todayDay = todayDate.getDate();

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const isToday =
        todayYear === currentYear &&
        todayMonth === currentMonthIndex &&
        todayDay === dayNum;

      const dateStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dateObj = new Date(currentYear, currentMonthIndex, dayNum);
      const dayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
      const aliases = dayAliases[dayKey] || [dayKey];

      if (calendarMode === 'individual') {
        const s = activeDossier?.schedule;
        let hasSession = false;
        let timeSlot = '';
        let kioskId = '';
        let exerciseCount = 0;
        let includeMinigame = false;
        let dateRangeStr = '';

        if (s) {
          const startDate = s.startDate || s.start_date || '1970-01-01';
          const endDate = s.endDate || s.end_date || '2099-12-31';
          const days = s.daysOfWeek || s.days_of_week || [];
          hasSession =
            dateStr >= startDate &&
            dateStr <= endDate &&
            days.some((d: string) => aliases.includes(d));
          timeSlot = s.timeSlot || s.time_slot || '09:00 - 10:00';
          kioskId = s.kioskId || s.assigned_kiosk_id || 'kiosk-01';
          exerciseCount =
            (s.assigned_exercises || s.prescribed_exercises || []).length;
          includeMinigame = Boolean(s.include_minigame);
          dateRangeStr = `${startDate} ถึง ${endDate}`;
        }

        const isPaused = false;
        const isPast = dateObj < new Date(todayYear, todayMonth, todayDay);
        const isCompleted = isPast && hasSession;

        map.set(dayNum, {
          hasSession,
          isToday,
          isPaused,
          isCompleted,
          timeSlot,
          kioskId,
          exerciseCount,
          includeMinigame,
          dateRangeStr,
          matchingSessions: [],
        });
      } else {
        // 'all' Mode: Aggregate across all dossiers
        const matchingSessions: Array<{
          patientName: string;
          hn: string;
          timeSlot: string;
          kioskId: string;
          includeMinigame: boolean;
        }> = [];

        dossiers.forEach((d) => {
          const s = d.schedule;
          if (!s) return;
          const startDate = s.startDate || s.start_date || '1970-01-01';
          const endDate = s.endDate || s.end_date || '2099-12-31';
          const days = s.daysOfWeek || s.days_of_week || [];
          if (
            dateStr >= startDate &&
            dateStr <= endDate &&
            days.some((alias: string) => aliases.includes(alias))
          ) {
            matchingSessions.push({
              patientName: `${d.first_name} ${d.last_name}`.trim(),
              hn: d.hn || d.patient_id,
              timeSlot: s.timeSlot || s.time_slot || '09:00 - 10:00',
              kioskId: s.kioskId || s.assigned_kiosk_id || 'kiosk-01',
              includeMinigame: Boolean(s.include_minigame),
            });
          }
        });

        const hasSession = matchingSessions.length > 0;
        const isPaused = false;
        const isPast = dateObj < new Date(todayYear, todayMonth, todayDay);
        const isCompleted = isPast && hasSession;

        map.set(dayNum, {
          hasSession,
          isToday,
          isPaused,
          isCompleted,
          timeSlot: matchingSessions[0]?.timeSlot || '',
          kioskId: matchingSessions[0]?.kioskId || '',
          exerciseCount: 0,
          includeMinigame: matchingSessions.some((m) => m.includeMinigame),
          dateRangeStr: '',
          matchingSessions,
        });
      }
    }

    return map;
  }, [calendarMode, activeDossier, dossiers, dayAliases, daysInMonth, currentYear, currentMonthIndex]);

  // Compute 4 KPI values dynamically
  const kpiStats = useMemo(() => {
    let totalSessions = 0;
    let activeSessions = 0;
    let pausedSessions = 0;
    let completedSessions = 0;

    monthlyScheduleMap.forEach((entry) => {
      if (entry.hasSession) {
        totalSessions++;
        if (entry.isPaused) {
          pausedSessions++;
        } else if (entry.isCompleted) {
          completedSessions++;
        } else {
          activeSessions++;
        }
      }
    });

    return {
      total: totalSessions,
      active: activeSessions,
      paused: pausedSessions,
      completed: completedSessions,
    };
  }, [monthlyScheduleMap]);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 font-sans">
      {/* 1. Header with Active Patient Card or Empty State */}
      {!selectedPatient ? (
        <MedicalCard className="p-8 bg-white border border-slate-200 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <User className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              ยังไม่มีข้อมูลคนไข้หรือตารางนัดหมายในระบบ กรุณาเพิ่มคนไข้ก่อนสร้างตารางฝึก
            </h3>
            <p className="text-xs text-slate-500">
              เลือกรอบนัดหมายจากรายการผู้ป่วย หรือกดปุ่มสร้างคนไข้ใหม่เพื่อเริ่มจัดตารางกายภาพ
            </p>
            <div className="pt-2">
              <SmoothButton
                variant="primary"
                size="md"
                onClick={() => handleOpenWizard()}
                icon={<Plus className="w-4 h-4" />}
              >
                <span>+ ลงทะเบียนคนไข้ใหม่</span>
              </SmoothButton>
            </div>
          </div>
        </MedicalCard>
      ) : (
        <MedicalCard className="p-6 bg-white border border-slate-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center font-bold text-xl shadow-md">
                <User className="w-7 h-7" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-slate-400">
                    HN: {selectedPatient.hn || selectedPatient.id}
                  </span>
                  <StatusBadge variant="active" text="กำลังเข้ารับการฟื้นฟู (Active)" />
                  {activeDossier?.schedule?.include_minigame && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                      <Brain className="w-3 h-3" />
                      รวมมินิเกม
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-800 tracking-normal">
                  {`${selectedPatient.first_name} ${selectedPatient.last_name}`.trim()}
                </h2>
                <p className="text-xs text-slate-500">
                  การวินิจฉัย: {selectedPatient.injury || 'อยู่ระหว่างประเมินอาการ'} • PT ผู้รับผิดชอบ: {activeDossier?.clinical?.responsible_pt_name || 'กภ. ประจำคลินิก'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Change Patient Dropdown / Trigger */}
              <select
                id="clinical-schedule-patient-select"
                value={selectedPatient.id}
                onChange={(e) => {
                  const found = patients.find((p) => p.id === e.target.value);
                  if (found) setSelectedPatient(found);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition focus:outline-none"
              >
                {(Array.isArray(patients) ? patients : []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.hn || p.id})
                  </option>
                ))}
              </select>

              <SmoothButton
                variant="primary"
                size="md"
                onClick={() => handleOpenWizard(selectedPatient.id)}
                icon={<Plus className="w-4 h-4" />}
              >
                <span>+ สร้างตารางฝึกใหม่</span>
              </SmoothButton>
            </div>
          </div>
        </MedicalCard>
      )}

      {/* 2. Mode Switcher & 4 KPI Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-slate-200/80 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => setCalendarMode('individual')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              calendarMode === 'individual'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ปฏิทินรายบุคคล
          </button>
          <button
            type="button"
            onClick={() => setCalendarMode('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              calendarMode === 'all'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ปฏิทินคนไข้รวม
          </button>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">ตารางนัดหมายทั้งหมด</span>
            <div className="text-2xl font-black text-slate-800 mt-1">{kpiStats.total} นัด</div>
            <span className="text-[11px] text-emerald-600 font-medium">สม่ำเสมอ 92%</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CalendarIcon className="w-6 h-6" />
          </div>
        </MedicalCard>

        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">กำลังรักษา (Active)</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{kpiStats.active} นัด</div>
            <span className="text-[11px] text-slate-400 font-medium">สัปดาห์ละ 3 วัน</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Activity className="w-6 h-6" />
          </div>
        </MedicalCard>

        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">พักชั่วคราว (Paused)</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{kpiStats.paused} นัด</div>
            <span className="text-[11px] text-amber-600 font-medium">ลาพักฟื้น</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <PauseCircle className="w-6 h-6" />
          </div>
        </MedicalCard>

        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">สำเร็จแล้ว (Completed)</span>
            <div className="text-2xl font-black text-sky-600 mt-1">{kpiStats.completed} นัด</div>
            <span className="text-[11px] text-sky-600 font-medium">ผ่านเกณฑ์ ROM</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </MedicalCard>
      </div>

      {/* 3. Monthly Grid Calendar */}
      <MedicalCard className="p-6 bg-white border border-slate-200">
        {/* Calendar Month Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-black text-slate-800">
              {thaiMonths[currentMonthIndex]} {currentYear + 543}
            </h3>
            <span className="text-xs text-slate-400 font-medium">({thaiMonths[currentMonthIndex]} {currentYear + 543})</span>
          </div>

          {/* Status Dots Legend */}
          <div className="flex items-center gap-4 text-xs font-semibold select-none flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600">กำลังรักษา</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-slate-600">พักการฝึก</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span className="text-slate-600">สำเร็จครบโปรแกรม</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-600">ขาดการฝึก</span>
            </div>
          </div>
        </div>

        {/* Responsive Horizontal Scroll Container for Calendar Grid */}
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch pb-2 table-scroll-container">
          <div className="min-w-[620px]">
            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400">
              {daysOfWeek.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid 7x5 */}
            <div className="grid grid-cols-7 gap-2">
          {/* Empty prefix slots */}
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="h-32 rounded-2xl bg-slate-50/50 border border-transparent" />
          ))}

          {/* Active Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const entry = monthlyScheduleMap.get(dayNum);
            const isToday = Boolean(entry?.isToday);
            const hasSession = Boolean(entry?.hasSession);
            const isPaused = Boolean(entry?.isPaused);
            const isCompleted = Boolean(entry?.isCompleted);

            return (
              <div
                key={dayNum}
                className={`group min-h-[8rem] p-2 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between ${
                  isToday
                    ? 'border-2 border-emerald-500 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-slate-200/80 bg-white hover:border-emerald-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isToday
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-700'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {hasSession && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isPaused
                          ? 'bg-amber-500'
                          : isCompleted
                          ? 'bg-sky-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                  )}
                </div>

                {/* Dynamic Session Pill preview */}
                {hasSession ? (
                  <div className="space-y-1 my-1">
                    {calendarMode === 'individual' ? (
                      <div className="text-[10px] font-semibold text-emerald-900 bg-emerald-100/90 px-2 py-1 rounded-lg">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold truncate">{entry?.timeSlot}</span>
                          {entry?.includeMinigame && (
                            <span title="รวมมินิเกมฝึกสมอง">
                              <Brain className="w-3 h-3 text-purple-600 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-emerald-700 mt-0.5">
                          <span className="flex items-center gap-0.5">
                            <Monitor className="w-2.5 h-2.5" />
                            {entry?.kioskId}
                          </span>
                          <span>{entry?.exerciseCount} ท่า</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-16 overflow-y-auto">
                        {(entry?.matchingSessions || []).length > 0 ? (
                          (entry?.matchingSessions || []).slice(0, 2).map((ms, idx) => (
                            <div
                              key={idx}
                              className="text-[9px] font-semibold text-emerald-900 bg-emerald-100/80 px-1.5 py-0.5 rounded truncate flex items-center justify-between"
                            >
                              <span className="truncate">{ms.patientName}</span>
                              <span className="text-[8px] text-emerald-700 ml-1">{ms.timeSlot.split(' ')[0]}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-1 rounded-lg truncate">
                            {entry?.timeSlot} (นัดหมาย)
                          </div>
                        )}
                        {(entry?.matchingSessions?.length || 0) > 2 && (
                          <div className="text-[8px] text-slate-500 text-center">
                            +{(entry?.matchingSessions?.length || 0) - 2} รายการ
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-300 font-medium">พักฟื้น</div>
                )}

                {/* Hover Add Course Button */}
                <button
                  type="button"
                  onClick={() => handleOpenWizard(selectedPatient?.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-full py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold text-center"
                >
                  + จัดคอร์สวันนี้
                </button>
              </div>
            );
          })}
        </div>
          </div>
        </div>
      </MedicalCard>

      {/* 3-Step Smart Schedule Wizard Modal */}
      <SmartScheduleWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => {
          setIsWizardOpen(false);
          void loadData();
        }}
        preselectedPatientId={wizardPatientId}
      />
    </div>
  );
};
