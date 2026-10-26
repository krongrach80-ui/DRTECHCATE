import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  X,
  RefreshCw,
  Layers,
  ChevronRight,
  Sparkles,
  Gamepad2
} from 'lucide-react';
import {
  TodayCourseItem,
  CourseRecord,
  PatientRecord,
  ModpackRecord,
  ExerciseRecord,
  KioskRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';
import {
  SmartScheduleView,
  SmartScheduleWizardModal
} from '../smart-portal/index.js';

interface PtScheduleViewProps {
  currentUserId: string;
}

const DEMO_PATIENTS: PatientRecord[] = [];
const DEMO_TODAY_COURSES: TodayCourseItem[] = [];

export const PtScheduleView: React.FC<PtScheduleViewProps> = ({
  currentUserId: _currentUserId,
}) => {
  const [subTab, setSubTab] = useState<'today' | 'calendar' | 'smart'>('today');
  const [isSmartWizardOpen, setIsSmartWizardOpen] = useState(false);
  const [todayCourses, setTodayCourses] = useState<TodayCourseItem[]>(DEMO_TODAY_COURSES);
  const [calendarCourses, setCalendarCourses] = useState<CourseRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>(DEMO_PATIENTS);
  const [modpacks, setModpacks] = useState<ModpackRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [kiosks, setKiosks] = useState<KioskRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 3-Step Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // Wizard form data
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedModpackId, setSelectedModpackId] = useState<string>('');
  const [selectedCustomExercises, setSelectedCustomExercises] = useState<
    Array<{ exercise_id: string; sets: number; reps: number }>
  >([]);
  const [includeMinigame, setIncludeMinigame] = useState(true);
  const [scheduleConfig, setScheduleConfig] = useState({
    start_date: '',
    end_date: '',
    weekdays: [1, 3, 5], // Mon, Wed, Fri
    start_time: '09:00',
    kiosk_id: '',
  });

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [today, cal, pts, mps, exs, kList] = await Promise.all([
        defaultApiClient.courses.getToday().catch(() => []),
        defaultApiClient.courses.getCalendar().catch(() => []),
        defaultApiClient.patients.list({ limit: 100 }).catch(() => []),
        defaultApiClient.modpacks.list().catch(() => []),
        defaultApiClient.exercises.list().catch(() => []),
        defaultApiClient.kiosk.listDevices().catch(() => []),
      ]);
      const safeToday = Array.isArray(today) && today.length > 0 ? today : DEMO_TODAY_COURSES;
      const rawPatients = Array.isArray(pts) ? pts : ((pts as any)?.patients || []);
      const safePatients = rawPatients.length > 0 ? rawPatients : DEMO_PATIENTS;
      setTodayCourses(safeToday);
      setCalendarCourses(Array.isArray(cal) ? cal : []);
      setPatients(safePatients);
      setModpacks(Array.isArray(mps) ? mps : []);
      setExercises(Array.isArray(exs) ? exs : []);
      setKiosks(Array.isArray(kList) ? kList : []);
    } catch {
      setTodayCourses(DEMO_TODAY_COURSES);
      setPatients(DEMO_PATIENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Initialize schedule dates on client mount to avoid impure Date() calls in useState
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const thirtyDaysStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    setScheduleConfig((prev) => ({
      ...prev,
      start_date: prev.start_date || todayStr,
      end_date: prev.end_date || thirtyDaysStr,
    }));
  }, []);

  const handleWeekdayToggle = (day: number) => {
    setScheduleConfig((prev) => {
      const exists = prev.weekdays.includes(day);
      const updated = exists ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day];
      return { ...prev, weekdays: updated.sort() };
    });
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
        items: selectedModpackId
          ? undefined
          : selectedCustomExercises.map((c, idx) => ({ ...c, position: idx + 1 })),
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
            วางแผนคอร์สการรักษาของคนไข้ด้วย Wizard 3 ขั้นตอน Snapshot รายการท่า และติดตามสถานะประจำวัน
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm shadow-lg shadow-teal-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างตารางนัดใหม่ (Wizard)</span>
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

      {/* Sub Tabs */}
      <div className="flex items-center border-b border-slate-800">
        <button
          onClick={() => setSubTab('today')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            subTab === 'today'
              ? 'border-teal-400 text-teal-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>นัดหมายวันนี้ (Today Queue) ({todayCourses.length})</span>
        </button>
        <button
          onClick={() => setSubTab('calendar')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            subTab === 'calendar'
              ? 'border-teal-400 text-teal-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>ปฏิทินคอร์สทั้งหมด (Calendar View) ({calendarCourses.length})</span>
        </button>
        <button
          onClick={() => setSubTab('smart')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            subTab === 'smart'
              ? 'border-emerald-400 text-emerald-300'
              : 'border-transparent text-emerald-400/70 hover:text-emerald-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Smart Schedule (v4)</span>
        </button>
      </div>

      {/* Master Prompt v4: Smart Schedule View */}
      {subTab === 'smart' && <SmartScheduleView />}

      {/* SubTab 1: Today Queue */}
      {subTab === 'today' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">เวลา</th>
                  <th className="px-6 py-4">คนไข้ & รหัส HN</th>
                  <th className="px-6 py-4">ชุดท่ากายภาพ / Modpack</th>
                  <th className="px-6 py-4">ตู้ Kiosk</th>
                  <th className="px-6 py-4">มินิเกม</th>
                  <th className="px-6 py-4">สถานะภารกิจ</th>
                  <th className="px-6 py-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      กำลังโหลดคิวฝึกวันนี้...
                    </td>
                  </tr>
                ) : todayCourses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      ไม่มีนัดหมายการฝึกกายภาพในวันนี้
                    </td>
                  </tr>
                ) : (
                  todayCourses.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4 font-mono font-semibold text-teal-400">
                        {item.start_time || 'ตามกำหนด'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">
                          {item.patient?.first_name} {item.patient?.last_name}
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">{item.patient?.hn}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-200">
                          {item.modpack_title || 'ชุดท่าเฉพาะบุคคล (Snapshot)'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {item.kiosk_name || 'ตู้ใดก็ได้'}
                      </td>
                      <td className="px-6 py-4">
                        {item.include_minigame ? (
                          <span className="text-xs text-teal-400 flex items-center gap-1">
                            <Gamepad2 className="w-3.5 h-3.5" />
                            <span>รวมมินิเกม</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">ไม่รวม</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {item.mission_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ฝึกเสร็จแล้ว</span>
                          </span>
                        ) : item.mission_status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
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

      {/* SubTab 2: Calendar View */}
      {subTab === 'calendar' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="font-bold text-white text-base">รายการคอร์สกายภาพที่กำลังดำเนินการทั้งหมด</h3>
            <span className="text-xs text-slate-400">ทั้งหมด {calendarCourses.length} คอร์ส</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendarCourses.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-white">
                      {c.patient?.first_name} {c.patient?.last_name}
                    </div>
                    <div className="text-xs font-mono text-teal-400">HN: {c.patient?.hn}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      c.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {c.status === 'active' ? 'กำลังดำเนินการ' : 'ยกเลิกแล้ว'}
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-1">
                  <div>
                    📅 ช่วงวัน: <span className="text-slate-200">{c.start_date} ถึง {c.end_date}</span>
                  </div>
                  <div>
                    ⏰ เวลา: <span className="text-slate-200">{c.start_time}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.weekdays.map((d) => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-teal-300"
                      >
                        {weekdayNames[d]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    {c.modpack?.name || c.modpack?.title || 'Snapshot ท่าเฉพาะบุคคล'}
                  </span>
                  {c.status === 'active' && (
                    <button
                      onClick={() => handleDeleteCourse(c.id)}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      ยกเลิกคอร์ส
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Step Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-6">
            {/* Wizard Header & Progress Bar */}
            <div className="border-b border-slate-800 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-teal-400" />
                  <span>สร้างตารางนัดหมายและแผนการรักษา (3-Step Wizard)</span>
                </h3>
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Steps Progress */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div
                  className={`flex-1 py-1.5 px-3 rounded-lg border text-center font-medium ${
                    wizardStep === 1
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  ขั้นที่ 1: เลือกคนไข้
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <div
                  className={`flex-1 py-1.5 px-3 rounded-lg border text-center font-medium ${
                    wizardStep === 2
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  ขั้นที่ 2: เลือกท่า/Modpack
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <div
                  className={`flex-1 py-1.5 px-3 rounded-lg border text-center font-medium ${
                    wizardStep === 3
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  ขั้นที่ 3: กำหนดวันและเวลา
                </div>
              </div>
            </div>

            {/* Step 1: Select Patient */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, นามสกุล หรือ HN..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredPatients.map((p) => {
                    const isSelected = selectedPatientId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPatientId(p.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-teal-500/15 border-teal-500 text-white'
                            : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-sm">
                            {p.first_name} {p.last_name}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            HN: {p.hn} • อายุ {p.age} ปี • {p.injury || 'กายภาพทั่วไป'}
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-teal-400" />}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    disabled={!selectedPatientId}
                    onClick={() => setWizardStep(2)}
                    className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-medium text-sm transition"
                  >
                    ถัดไป: เลือกท่ากายภาพ
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Select Modpack or Exercises */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    เลือกชุดท่ากายภาพ (Modpack) สำเร็จรูป:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                    {modpacks.map((mp) => {
                      const isSelected = selectedModpackId === mp.id;
                      return (
                        <div
                          key={mp.id}
                          onClick={() => {
                            setSelectedModpackId(mp.id);
                            setSelectedCustomExercises([]);
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition ${
                            isSelected
                              ? 'bg-teal-500/15 border-teal-500 text-white'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="font-semibold text-sm flex items-center justify-between">
                            <span>{mp.name || mp.title}</span>
                            <Layers className="w-4 h-4 text-teal-400" />
                          </div>
                          <div className="text-xs text-slate-400 mt-1 line-clamp-1">
                            {mp.description || 'ไม่มีคำอธิบาย'}
                          </div>
                          <div className="text-[11px] text-teal-400 mt-2 font-mono">
                            {mp.items?.length || 0} ท่าในชุด
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Option to customize individual exercises if no modpack */}
                {!selectedModpackId && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="block text-xs font-medium text-slate-300">
                      หรือเลือกท่ากายภาพเฉพาะบุคคล (Custom Exercises):
                    </label>
                    <div className="max-h-36 overflow-y-auto space-y-1.5">
                      {exercises.map((ex) => {
                        const isChecked = selectedCustomExercises.some(
                          (c) => c.exercise_id === ex.id
                        );
                        return (
                          <div
                            key={ex.id}
                            className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                          >
                            <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCustomExercises([
                                      ...selectedCustomExercises,
                                      {
                                        exercise_id: ex.id,
                                        sets: ex.default_sets || 3,
                                        reps: ex.default_reps || 10,
                                      },
                                    ]);
                                  } else {
                                    setSelectedCustomExercises(
                                      selectedCustomExercises.filter((c) => c.exercise_id !== ex.id)
                                    );
                                  }
                                }}
                                className="rounded border-slate-700 bg-slate-900 text-teal-500"
                              />
                              <span>{ex.title}</span>
                            </label>
                            <span className="text-slate-500 font-mono">
                              {ex.default_sets}×{ex.default_reps}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Include Minigame Option */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-cyan-400" />
                    <div>
                      <div className="text-sm font-semibold text-white">บรรจุมินิเกมฝึกสมอง</div>
                      <div className="text-xs text-slate-400">
                        รวมเกมตอบคำถามกระตุ้นสมองหลังจากคนไข้ฝึกท่าเสร็จ
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeMinigame}
                    onChange={(e) => setIncludeMinigame(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-teal-500"
                  />
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    disabled={!selectedModpackId && selectedCustomExercises.length === 0}
                    onClick={() => setWizardStep(3)}
                    className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-medium text-sm transition"
                  >
                    ถัดไป: กำหนดวันและเวลา
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Date, Time & Kiosk Configuration */}
            {wizardStep === 3 && (
              <form onSubmit={handleCreateCourse} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">วันเริ่มต้น</label>
                    <input
                      type="date"
                      required
                      value={scheduleConfig.start_date}
                      onChange={(e) =>
                        setScheduleConfig({ ...scheduleConfig, start_date: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">วันสิ้นสุด</label>
                    <input
                      type="date"
                      required
                      value={scheduleConfig.end_date}
                      onChange={(e) =>
                        setScheduleConfig({ ...scheduleConfig, end_date: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    วันในสัปดาห์ที่นัดหมาย (Weekdays):
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {weekdayNames.map((name, idx) => {
                      const isSelected = scheduleConfig.weekdays.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleWeekdayToggle(idx)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                            isSelected
                              ? 'bg-teal-500 text-white shadow-sm'
                              : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">เวลานัดหมาย</label>
                    <input
                      type="time"
                      required
                      value={scheduleConfig.start_time}
                      onChange={(e) =>
                        setScheduleConfig({ ...scheduleConfig, start_time: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      ระบุตู้ Kiosk ประจำ
                    </label>
                    <select
                      value={scheduleConfig.kiosk_id}
                      onChange={(e) =>
                        setScheduleConfig({ ...scheduleConfig, kiosk_id: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="">ตู้ใดก็ได้ในแผนก</option>
                      {kiosks.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name} ({k.location || 'ไม่ระบุ'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 flex-shrink-0" />
                  <span>
                    เมื่อยืนยัน ระบบจะคัดลอก snapshot รายการท่าทั้งหมดลงใน course_items
                    ทำให้การเปลี่ยนแปลง modpack ในภายหลังไม่กระทบคอร์สที่จ่ายไปแล้ว
                  </span>
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                  >
                    {actionLoading ? 'กำลังสร้างคอร์ส...' : 'ยืนยันสร้างตารางนัด'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Master Prompt v4: Smart Schedule Wizard Modal */}
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
