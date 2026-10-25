import React, { useState, useEffect } from 'react';
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

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [today, pats, mpacks, exs] = await Promise.all([
        defaultApiClient.courses.getToday().catch(() => []),
        defaultApiClient.patients.list(),
        defaultApiClient.modpacks.list().catch(() => []),
        defaultApiClient.exercises.list().catch(() => []),
      ]);
      setTodayCourses(today);
      setPatients(pats);
      setModpacks(mpacks);
      setExercises(exs);

      // Also fetch calendar for current month
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const cal = await defaultApiClient.courses.getCalendar({ start_date: start, end_date: end }).catch(() => []);
      setCalendarCourses(cal);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดตารางนัดหมายได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const nextMonthStr = nextMonth.toISOString().split('T')[0];
    setScheduleConfig((prev) => ({
      ...prev,
      start_date: prev.start_date || todayStr,
      end_date: prev.end_date || nextMonthStr,
    }));
    fetchInitialData();
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
        start_date: scheduleConfig.start_date,
        end_date: scheduleConfig.end_date,
        weekdays: scheduleConfig.weekdays,
        start_time: scheduleConfig.start_time,
        kiosk_id: scheduleConfig.kiosk_id || undefined,
        include_minigame: includeMinigame,
        modpack_id: selectedModpackId || undefined,
        items: selectedModpackId ? undefined : selectedCustomExercises,
      });

      setSuccessMsg('สร้างตารางนัดหมายคอร์สกายภาพบำบัดสำเร็จ พร้อม snapshot รายการท่าเรียบร้อย');
      setIsWizardOpen(false);
      setWizardStep(1);
      setSelectedPatientId('');
      setSelectedModpackId('');
      setSelectedCustomExercises([]);
      await fetchInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างตารางนัด');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!window.confirm('ยืนยันการยกเลิกคอร์สการรักษานี้?')) return;
    try {
      setActionLoading(true);
      await defaultApiClient.courses.update(courseId, { status: 'cancelled', version: 1 });
      setSuccessMsg('ยกเลิกคอร์สการรักษาเรียบร้อย');
      await fetchInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถยกเลิกคอร์สได้');
    } finally {
      setActionLoading(false);
    }
  };

  const weekdayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  const filteredPatients = patients.filter(
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

        <div className="flex items-center gap-3">
          <button
            onClick={fetchInitialData}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsSmartWizardOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-950/40"
          >
            <Sparkles className="w-4 h-4" />
            <span>Smart Wizard (v4)</span>
          </button>
          <button
            onClick={() => {
              setIsWizardOpen(true);
              setWizardStep(1);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างตารางนัดใหม่ (Wizard 3 ขั้น)</span>
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
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setViewMode('today')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            viewMode === 'today'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          นัดวันนี้ (Today's Queue)
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            viewMode === 'calendar'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          มุมมองปฏิทิน (Calendar View)
        </button>
        <button
          onClick={() => setViewMode('smart')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
            viewMode === 'smart'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
              : 'text-emerald-400 hover:text-emerald-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Smart Schedule Manager (v4)</span>
        </button>
      </div>

      {/* VIEW SMART: MASTER PROMPT V4 SCHEDULE VIEW */}
      {viewMode === 'smart' && <SmartScheduleView />}

      {/* VIEW A: TODAY'S QUEUE */}
      {viewMode === 'today' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Clock className="w-4 h-4 text-teal-400" />
              <span>คิวตรวจกายภาพบำบัดประจำวันนี้ ({todayCourses.length} ท่าน)</span>
            </div>
            <span className="text-xs text-slate-400">
              {new Date().toLocaleDateString('th-TH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">เวลา</th>
                  <th className="px-6 py-4 font-semibold">คนไข้</th>
                  <th className="px-6 py-4 font-semibold">รหัส HN</th>
                  <th className="px-6 py-4 font-semibold">ตู้ Kiosk</th>
                  <th className="px-6 py-4 font-semibold">สถานะภารกิจวันนี้</th>
                  <th className="px-6 py-4 font-semibold text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {todayCourses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      ไม่มีนัดหมายกายภาพบำบัดในวันนี้
                    </td>
                  </tr>
                ) : (
                  todayCourses.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4 font-mono font-bold text-teal-400">
                        {item.start_time || '09:00'} น.
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        {item.patient?.first_name} {item.patient?.last_name}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {item.patient?.hn || '-'}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5 text-slate-500" />
                          <span>{item.kiosk_id || 'ตู้ใดก็ได้'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {item.mission_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ฝึกเสร็จแล้ว</span>
                          </span>
                        ) : item.mission_status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                            <Clock className="w-3 h-3 animate-spin" />
                            <span>กำลังฝึกที่ตู้</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
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
                          className="text-slate-500 hover:text-rose-400 p-1"
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-teal-400" />
              <span>คอร์สการรักษาประจำเดือน ({calendarCourses.length} คอร์สที่เปิดอยู่)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendarCourses.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500">
                ไม่มีคอร์สการรักษาในเดือนนี้
              </div>
            ) : (
              calendarCourses.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-slate-500">คนไข้ ID: {c.patient_id.slice(0, 8)}...</div>
                      <div className="font-bold text-white text-sm mt-0.5">
                        {c.start_date} ถึง {c.end_date}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                      {c.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1">
                    <div>
                      วันนัด:{' '}
                      <strong className="text-teal-300">
                        {c.weekdays.map((d: number) => weekdayNames[d]).join(', ')}
                      </strong>
                    </div>
                    <div>เวลา: {c.start_time || '09:00'} น.</div>
                    <div>ตู้: {c.kiosk_id || 'ทุกตู้'}</div>
                    <div>มินิเกม: {c.include_minigame ? 'เปิดใช้งาน' : 'ปิด'}</div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => handleDeleteCourse(c.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-teal-400" />
                  <span>สร้างตารางนัดหมายกายภาพบำบัด (Schedule Wizard)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
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
                className="text-slate-500 hover:text-slate-300"
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
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-800 rounded-2xl p-2 bg-slate-950">
                    {filteredPatients.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">ไม่พบคนไข้</div>
                    ) : (
                      filteredPatients.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPatientId(p.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                            selectedPatientId === p.id
                              ? 'bg-teal-500/10 border-teal-500 text-teal-300'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-white">
                              {p.first_name} {p.last_name}
                            </div>
                            <div className="text-slate-400">{p.injury || 'ไม่ได้ระบุอาการ'}</div>
                          </div>
                          <span className="font-mono font-bold text-teal-400">{p.hn}</span>
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
                    <label className="block text-xs font-bold text-slate-300 mb-2">
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
                              ? 'bg-teal-500/10 border-teal-500 text-teal-300'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-white">{mp.name}</div>
                            <div className="text-slate-500">{mp.items?.length || 0} ท่าในชุด</div>
                          </div>
                          <span className="font-mono text-xs">
                            {selectedModpackId === mp.id ? '✓ เลือกแล้ว' : 'เลือก'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Gamepad2 className="w-4 h-4 text-teal-400" />
                        <span>เปิดใช้งานมินิเกมฝึกสมอง (Cognitive PT)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        ให้คนไข้ทำโจทย์มินิเกม 1 เกมหลังบริหารท่าเสร็จ
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeMinigame}
                      onChange={(e) => setIncludeMinigame(e.target.checked)}
                      className="w-4 h-4 accent-teal-500"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: DATE, WEEKDAYS, TIME, KIOSK */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        วันที่เริ่มต้น *
                      </label>
                      <input
                        type="date"
                        required
                        value={scheduleConfig.start_date}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, start_date: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        วันที่สิ้นสุด *
                      </label>
                      <input
                        type="date"
                        required
                        value={scheduleConfig.end_date}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, end_date: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">
                      วันในสัปดาห์ที่นัดหมาย *
                    </label>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {weekdayNames.map((day, idx) => {
                        const isSelected = scheduleConfig.weekdays.includes(idx);
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => handleWeekdayToggle(idx)}
                            className={`py-2 rounded-xl text-xs font-bold transition ${
                              isSelected
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:border-slate-700'
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
                      <label className="block text-xs font-medium text-slate-300 mb-1">เวลานัด *</label>
                      <input
                        type="time"
                        required
                        value={scheduleConfig.start_time}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, start_time: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        ตู้ Kiosk ประจำ
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น kiosk-01"
                        value={scheduleConfig.kiosk_id}
                        onChange={(e) =>
                          setScheduleConfig({ ...scheduleConfig, kiosk_id: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Wizard Navigation */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => prev - 1)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium"
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
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm disabled:opacity-50"
                  >
                    <span>ขั้นตอนถัดไป</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-lg shadow-teal-950/40 disabled:opacity-50"
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
