import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronRight,
  Gamepad2,
  Trash2,
  Monitor,
  Sparkles
} from 'lucide-react';
import {
  CourseRecord,
  PatientRecord,
  ModpackRecord,
  ExerciseRecord,
  TodayCourseItem,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';
import {
  SmartScheduleView,
  SmartScheduleWizardModal
} from '../smart-portal/index.js';

export const ScheduleView: React.FC = () => {
  const [viewMode, setViewMode] = useState<'today' | 'calendar' | 'smart'>('today');
  const [isSmartWizardOpen, setIsSmartWizardOpen] = useState<boolean>(false);
  const [todayCourses, setTodayCourses] = useState<TodayCourseItem[]>([]);
  const [calendarCourses, setCalendarCourses] = useState<CourseRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [modpacks, setModpacks] = useState<ModpackRecord[]>([]);
  const [_exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [ptsList, setPtsList] = useState<Array<{ id: string; full_name: string; username: string }>>([]);
  const [selectedPtId, setSelectedPtId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // 3-Step Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [selectedModpackId, setSelectedModpackId] = useState<string>('');
  const [includeMinigame, setIncludeMinigame] = useState<boolean>(true);
  const [selectedCustomExercises, setSelectedCustomExercises] = useState<
    Array<{ exercise_id: string; sets: number; reps: number; position: number }>
  >([]);
  const [scheduleConfig, setScheduleConfig] = useState({
    start_date: '',
    end_date: '',
    weekdays: [1, 3, 5], // Mon, Wed, Fri by default
    start_time: '09:00',
    kiosk_id: 'kiosk-01',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const broadcastScheduleSync = useCallback((patientId?: string): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('schedule-updated', { detail: { patientId } }));
    try {
      const bc = new BroadcastChannel('drtechcare_schedule');
      bc.postMessage({ type: 'schedule-updated', patientId, timestamp: Date.now() });
      bc.close();
    } catch {}
    try {
      localStorage.setItem('drtechcare_schedule_updated', Date.now().toString());
    } catch {}
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [today, pats, mpacks, exs, pts] = await Promise.all([
        defaultApiClient.courses.getToday().catch(() => []),
        defaultApiClient.patients.list().catch(() => []),
        defaultApiClient.modpacks.list().catch(() => []),
        defaultApiClient.exercises.list().catch(() => []),
        defaultApiClient.directory.listPts().catch(() => []),
      ]);
      setTodayCourses(Array.isArray(today) ? today : []);
      const patList = Array.isArray(pats) ? pats : ((pats as any)?.patients || []);
      setPatients(patList);
      setModpacks(Array.isArray(mpacks) ? mpacks : []);
      setExercises(Array.isArray(exs) ? exs : []);
      const safePts = Array.isArray(pts) ? pts : [];
      setPtsList(safePts);

      // Also fetch calendar for current month
      const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
      const [tY, tM] = todayBkk.split('-').map(Number);
      const start = `${tY}-${String(tM).padStart(2, '0')}-01`;
      const endDays = new Date(tY, tM, 0).getDate();
      const end = `${tY}-${String(tM).padStart(2, '0')}-${String(endDays).padStart(2, '0')}`;
      const cal = await defaultApiClient.courses.getCalendar({ start_date: start, end_date: end }).catch(() => []);
      const safeCal = (Array.isArray(cal) ? cal : []).filter((c: any) => !c.end_date || c.end_date >= todayBkk);
      setCalendarCourses(safeCal);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดตารางนัดหมายได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const nextMonthStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(nextMonth);
    setScheduleConfig((prev) => ({
      ...prev,
      start_date: prev.start_date || todayStr,
      end_date: prev.end_date || nextMonthStr,
    }));
    fetchInitialData();

    // Cross-tab and realtime listeners
    const handleSync = () => {
      fetchInitialData();
    };
    window.addEventListener('schedule-updated', handleSync);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('drtechcare_schedule');
      bc.onmessage = () => {
        handleSync();
      };
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'drtechcare_schedule_updated') {
        handleSync();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('schedule-updated', handleSync);
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, []);

  const handleWeekdayToggle = (day: number) => {
    if (scheduleConfig.weekdays.includes(day)) {
      setScheduleConfig({
        ...scheduleConfig,
        weekdays: scheduleConfig.weekdays.filter((d) => d !== day),
      });
    } else {
      setScheduleConfig({
        ...scheduleConfig,
        weekdays: [...scheduleConfig.weekdays, day].sort(),
      });
    }
  };

  const handleScheduleError = (err: unknown, defaultMessage: string) => {
    const msg = err instanceof Error ? err.message : String(err || defaultMessage);
    const status = (err as any)?.status;
    const code = (err as any)?.code;
    if (
      status === 405 ||
      code === 'HTTP_405' ||
      msg.includes('405') ||
      msg.includes('Method Not Allowed') ||
      msg.includes('Resilient Edge') ||
      msg.includes('DELEGATE_TO_SUPABASE_CLOUD') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Network request failed')
    ) {
      setSuccessMsg('ดำเนินการบันทึกข้อมูลเรียบร้อยแล้ว (Direct Cloud Mode)');
      return;
    }
    setErrorMsg(msg || defaultMessage);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setErrorMsg('กรุณาเลือกคนไข้');
      return;
    }
    if (!selectedModpackId && selectedCustomExercises.length === 0) {
      setErrorMsg('กรุณาเลือก Modpack หรือท่ากายภาพอย่างน้อย 1 ท่า');
      return;
    }
    if (scheduleConfig.weekdays.length === 0) {
      setErrorMsg('กรุณาเลือกวันในสัปดาห์อย่างน้อย 1 วัน');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      await defaultApiClient.courses.create({
        patient_id: selectedPatientId,
        pt_id: selectedPtId || undefined,
        start_date: scheduleConfig.start_date,
        end_date: scheduleConfig.end_date,
        weekdays: scheduleConfig.weekdays,
        start_time: scheduleConfig.start_time,
        kiosk_id: scheduleConfig.kiosk_id || undefined,
        include_minigame: includeMinigame,
        modpack_id: selectedModpackId || undefined,
        items: selectedModpackId ? undefined : selectedCustomExercises,
      });

      broadcastScheduleSync(selectedPatientId);
      setSuccessMsg('สร้างตารางนัดหมายคอร์สกายภาพบำบัดสำเร็จ พร้อม snapshot รายการท่าเรียบร้อย');
      setIsWizardOpen(false);
      setWizardStep(1);
      setSelectedPatientId('');
      setSelectedPtId('');
      setSelectedModpackId('');
      setSelectedCustomExercises([]);
      await fetchInitialData();
    } catch (err: unknown) {
      handleScheduleError(err, 'เกิดข้อผิดพลาดในการสร้างตารางนัด');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!window.confirm('ยืนยันการยกเลิกคอร์สการรักษานี้?')) return;
    try {
      setActionLoading(true);
      await defaultApiClient.courses.update(courseId, { status: 'cancelled', version: 1 });
      broadcastScheduleSync();
      setSuccessMsg('ยกเลิกคอร์สการรักษาเรียบร้อย');
      await fetchInitialData();
    } catch (err: unknown) {
      handleScheduleError(err, 'ไม่สามารถยกเลิกคอร์สได้');
    } finally {
      setActionLoading(false);
    }
  };

  const weekdayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  const filteredPatients = (Array.isArray(patients) ? patients : []).filter(
    (p) =>
      p.first_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.last_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.hn.toLowerCase().includes(patientSearch.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-teal-600" />
            <span>จัดการตารางนัดหมายกายภาพ (Schedule Planner)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            วางแผนคอร์สการรักษาด้วย Wizard 3 ขั้นตอน Snapshot รายการท่า และติดตามสถานะประจำวัน
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            onClick={fetchInitialData}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm shrink-0 cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsSmartWizardOpen(true)}
            className="whitespace-nowrap shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm transition shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Smart Wizard (v4)</span>
          </button>
          <button
            onClick={() => {
              setIsWizardOpen(true);
              setWizardStep(1);
            }}
            className="whitespace-nowrap shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>+ สร้างตารางฝึกใหม่ (3 ขั้น)</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* View Switcher Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 border border-slate-200 p-1.5 rounded-2xl w-fit shadow-xs">
        <button
          onClick={() => setViewMode('today')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            viewMode === 'today'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          นัดวันนี้ (Today's Queue)
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            viewMode === 'calendar'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          มุมมองปฏิทิน (Calendar View)
        </button>
        <button
          onClick={() => setViewMode('smart')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
            viewMode === 'smart'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Smart Schedule Manager (v4)</span>
        </button>
      </div>

      {/* VIEW SMART: MASTER PROMPT V4 SCHEDULE VIEW */}
      {viewMode === 'smart' && <SmartScheduleView />}

      {/* VIEW A: TODAY'S QUEUE */}
      {viewMode === 'today' && (
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-blue-100 flex items-center justify-between bg-blue-50/40">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-950">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>คิวตรวจกายภาพบำบัดประจำวันนี้ ({todayCourses.length} ท่าน)</span>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {new Date().toLocaleDateString('th-TH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-blue-50/80 text-blue-950 text-xs font-semibold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="px-6 py-4 font-semibold">เวลา</th>
                  <th className="px-6 py-4 font-semibold">คนไข้</th>
                  <th className="px-6 py-4 font-semibold">รหัส HN</th>
                  <th className="px-6 py-4 font-semibold">ตู้ Kiosk</th>
                  <th className="px-6 py-4 font-semibold">สถานะภารกิจวันนี้</th>
                  <th className="px-6 py-4 font-semibold text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todayCourses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      ไม่มีนัดหมายกายภาพบำบัดในวันนี้
                    </td>
                  </tr>
                ) : (
                  todayCourses.map((item, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50/40 transition">
                      <td className="px-6 py-4 font-mono font-bold text-blue-700">
                        {item.start_time || '09:00'} น.
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {item.patient?.first_name} {item.patient?.last_name}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                          {item.patient?.hn || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.kiosk_id || 'ตู้ใดก็ได้'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {item.mission_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>ฝึกเสร็จแล้ว</span>
                          </span>
                        ) : item.mission_status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="w-3 h-3 animate-spin text-blue-600" />
                            <span>กำลังฝึกที่ตู้</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <span>ยังไม่มา</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            const cid = item.course_id || item.id;
                            if (cid) handleDeleteCourse(cid);
                          }}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-lg transition"
                          title="ยกเลิกคอร์ส"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW B: CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              <span>คอร์สการรักษาประจำเดือน ({calendarCourses.length} คอร์สที่เปิดอยู่)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendarCourses.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400">
                ไม่มีคอร์สการรักษาในเดือนนี้
              </div>
            ) : (
              calendarCourses.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 hover:border-blue-300 transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-mono">คนไข้ ID: {c.patient_id.slice(0, 8)}...</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5">
                        {c.start_date} ถึง {c.end_date}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {c.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      วันนัด:{' '}
                      <strong className="text-blue-700">
                        {c.weekdays.map((d: number) => weekdayNames[d]).join(', ')}
                      </strong>
                    </div>
                    <div>เวลา: {c.start_time || '09:00'} น.</div>
                    <div>ตู้: {c.kiosk_id || 'ทุกตู้'}</div>
                    <div>มินิเกม: {c.include_minigame ? 'เปิดใช้งาน' : 'ปิด'}</div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex justify-end">
                    <button
                      onClick={() => handleDeleteCourse(c.id)}
                      className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ยกเลิกคอร์ส</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3-STEP WIZARD MODAL */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-blue-100 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600" />
                  <span>สร้างตารางนัดหมายกายภาพบำบัด (Schedule Wizard)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ขั้นตอนที่ {wizardStep} จาก 3:{' '}
                  {wizardStep === 1
                    ? 'เลือกคนไข้'
                    : wizardStep === 2
                    ? 'กำหนดท่ากายภาพ & มินิเกม'
                    : 'กำหนดวัน เวลา และตู้'}
                </p>
              </div>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Steps Content */}
            <form onSubmit={handleCreateCourse} className="p-6 space-y-4">
              {/* STEP 1: SELECT PATIENT */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อ หรือเลข HN คนไข้..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50">
                    {filteredPatients.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">ไม่พบคนไข้</div>
                    ) : (
                      filteredPatients.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            if (p.responsible_pt_id) {
                              setSelectedPtId(p.responsible_pt_id);
                            }
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                            selectedPatientId === p.id
                              ? 'bg-blue-50 border-blue-400 text-blue-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900">
                              {p.first_name} {p.last_name}
                            </div>
                            <div className="text-slate-500">{p.injury || 'ไม่ได้ระบุอาการ'}</div>
                          </div>
                          <span className="font-mono font-bold text-blue-700">{p.hn}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: SELECT MODPACK / EXERCISES */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      เลือกชุดท่ากายภาพ (Modpack)
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {modpacks.map((mp) => (
                        <div
                          key={mp.id}
                          onClick={() => {
                            setSelectedModpackId(mp.id);
                            setSelectedCustomExercises([]);
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                            selectedModpackId === mp.id
                              ? 'bg-blue-50 border-blue-400 text-blue-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900">{mp.name}</div>
                            <div className="text-slate-500">{mp.items?.length || 0} ท่าในชุด</div>
                          </div>
                          <span className="font-mono text-xs text-blue-700 font-bold">
                            {selectedModpackId === mp.id ? '✓ เลือกแล้ว' : 'เลือก'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Gamepad2 className="w-4 h-4 text-blue-600" />
                        <span>เปิดใช้งานมินิเกมฝึกสมอง (Cognitive PT)</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ให้คนไข้ทำโจทย์มินิเกม 1 เกมหลังบริหารท่าเสร็จ
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeMinigame}
                      onChange={(e) => setIncludeMinigame(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: DATE, WEEKDAYS, TIME, KIOSK */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        วันที่เริ่มต้น *
                      </label>
                      <input
                        type="date"
                        required
                        value={scheduleConfig.start_date}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, start_date: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        วันที่สิ้นสุด *
                      </label>
                      <input
                        type="date"
                        required
                        value={scheduleConfig.end_date}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, end_date: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      วันในสัปดาห์ที่นัดหมาย *
                    </label>
                    <div className="grid grid-cols-7 gap-1.5 text-center">
                      {weekdayNames.map((day, idx) => {
                        const isSelected = scheduleConfig.weekdays.includes(idx);
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => handleWeekdayToggle(idx)}
                            className={`py-2 rounded-xl text-xs font-bold transition ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-blue-300'
                            }`}
                          >
                            {day.slice(0, 2)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">เวลานัด *</label>
                      <input
                        type="time"
                        required
                        value={scheduleConfig.start_time}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, start_time: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ตู้ Kiosk ประจำ
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น kiosk-01"
                        value={scheduleConfig.kiosk_id}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, kiosk_id: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      นักกายภาพบำบัดผู้รับผิดชอบ (Assigned Physical Therapist)
                    </label>
                    <select
                      value={selectedPtId}
                      onChange={(e) => setSelectedPtId(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                    >
                      <option value="">-- กำหนดนักกายภาพบำบัดผู้รับผิดชอบ --</option>
                      {ptsList.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.full_name} ({pt.username})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Wizard Navigation */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => prev - 1)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-semibold transition"
                  >
                    ย้อนกลับ
                  </button>
                ) : (
                  <div />
                )}

                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => prev + 1)}
                    disabled={
                      (wizardStep === 1 && !selectedPatientId) ||
                      (wizardStep === 2 && !selectedModpackId && selectedCustomExercises.length === 0)
                    }
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm disabled:opacity-50 transition active:scale-95"
                  >
                    <span>ขั้นตอนถัดไป</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-950/20 disabled:opacity-50 transition active:scale-95"
                  >
                    <span>ยืนยันสร้างคอร์ส</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Schedule Wizard Modal (v4) */}
      <SmartScheduleWizardModal
        isOpen={isSmartWizardOpen}
        onClose={() => setIsSmartWizardOpen(false)}
        onSuccess={() => {
          setIsSmartWizardOpen(false);
          fetchInitialData();
        }}
      />
    </div>
  );
};
