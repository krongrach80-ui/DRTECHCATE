/**
 * apps/admin/src/smart-portal/SmartScheduleWizardModal.tsx
 * Easy 3-Step Schedule Creation Wizard (Master Prompt v4 Section 4.2)
 */

import React, { useState, useEffect } from 'react';
import { defaultApiClient, PatientRecord } from '../../../../packages/api-client/src/index.js';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Brain,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Layers,
} from 'lucide-react';

interface PrescribedExerciseInput {
  exercise_id: string;
  name: string;
  target_joint: string;
  sets: number;
  reps: number;
  demo_url?: string;
}

interface SmartScheduleWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPatientId?: string;
}

export const SmartScheduleWizardModal: React.FC<SmartScheduleWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedPatientId,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // STEP 1 State: Select Patient
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);

  // STEP 2 State: Exercises & Minigame
  const [availableExercises, setAvailableExercises] = useState<any[]>([]);
  const [availableModpacks, setAvailableModpacks] = useState<any[]>([]);
  const [prescribedExercises, setPrescribedExercises] = useState<PrescribedExerciseInput[]>([]);
  const [includeMinigame, setIncludeMinigame] = useState(true);

  // STEP 3 State: Days of Week, Date Range, Time, Kiosk
  const allDaysOfWeek = [
    { key: 'Mon', label: 'จันทร์' },
    { key: 'Tue', label: 'อังคาร' },
    { key: 'Wed', label: 'พุธ' },
    { key: 'Thu', label: 'พฤหัสบดี' },
    { key: 'Fri', label: 'ศุกร์' },
    { key: 'Sat', label: 'เสาร์' },
    { key: 'Sun', label: 'อาทิตย์' },
  ];
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Wed', 'Fri']);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [timeSlot, setTimeSlot] = useState('09:00 - 10:00');
  const [assignedKioskId, setAssignedKioskId] = useState('kiosk-01');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      try {
        const [patientsList, exList, modList] = await Promise.all([
          defaultApiClient.patients.list().catch(() => []),
          defaultApiClient.exercises.list().catch(() => []),
          defaultApiClient.modpacks.list().catch(() => []),
        ]);

        setPatients(patientsList);
        setAvailableExercises(
          exList.map((ex) => ({
            id: ex.id,
            name: ex.title,
            target_joint: ex.target_joint || 'ทั่วไป',
            demo_url: ex.image_path || undefined,
            default_sets: ex.default_sets || 3,
            default_reps: ex.default_reps || 10,
          }))
        );
        setAvailableModpacks(
          modList.map((m) => ({
            id: m.id,
            name: m.name || m.title || 'ชุดท่าฝึก',
            items: (m.items || []).map((it) => ({
              exercise_id: it.exercise_id,
              name: it.exercise?.title || 'ท่ากายภาพ',
              target_joint: it.exercise?.target_joint || 'ทั่วไป',
              sets: it.sets || 3,
              reps: it.reps || 10,
              demo_url: it.exercise?.image_path || undefined,
            })),
          }))
        );

        if (preselectedPatientId) {
          const match = patientsList.find((p) => p.id === preselectedPatientId || p.hn === preselectedPatientId);
          if (match) setSelectedPatient(match);
        }
      } catch {
        // non-blocking
      }
    }

    loadData();
  }, [isOpen, preselectedPatientId]);

  if (!isOpen) return null;

  // Toggle Day selection
  const toggleDay = (dayKey: string) => {
    if (selectedDays.includes(dayKey)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayKey));
    } else {
      setSelectedDays([...selectedDays, dayKey]);
    }
  };

  // Apply Modpack Template
  const applyModpack = (modpack: any) => {
    if (modpack.items && Array.isArray(modpack.items)) {
      const items: PrescribedExerciseInput[] = modpack.items.map((it: any) => ({
        exercise_id: it.exercise_id,
        name: it.name || it.exercise_name || 'ท่ากายภาพ',
        target_joint: it.target_joint || 'ทั่วไป',
        sets: it.sets || 3,
        reps: it.reps || 10,
        demo_url: it.demo_url,
      }));
      setPrescribedExercises(items);
    }
  };

  // Update Set/Rep
  const updateExerciseSets = (index: number, delta: number) => {
    setPrescribedExercises((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const newSets = Math.max(1, item.sets + delta);
        return { ...item, sets: newSets };
      })
    );
  };

  const updateExerciseReps = (index: number, delta: number) => {
    setPrescribedExercises((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const newReps = Math.max(1, item.reps + delta);
        return { ...item, reps: newReps };
      })
    );
  };

  const removeExercise = (index: number) => {
    setPrescribedExercises((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addExercise = (ex: any) => {
    setPrescribedExercises((prev) => [
      ...prev,
      {
        exercise_id: ex.id,
        name: ex.name,
        target_joint: ex.target_joint,
        sets: 3,
        reps: 10,
        demo_url: ex.demo_url,
      },
    ]);
  };

  // Submit Schedule
  const handleSaveSchedule = async () => {
    if (!selectedPatient) {
      setErrorMsg('กรุณาเลือกคนไข้');
      return;
    }
    if (prescribedExercises.length === 0) {
      setErrorMsg('กรุณาเลือกท่าฝึกกายภาพอย่างน้อย 1 ท่า');
      return;
    }
    if (selectedDays.length === 0) {
      setErrorMsg('กรุณาเลือกวันในสัปดาห์อย่างน้อย 1 วัน');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await defaultApiClient.smartOnboarding.saveSchedule({
        patient_id: selectedPatient.id || (selectedPatient as any).patient_id,
        schedule: {
          start_date: startDate,
          end_date: endDate,
          days_of_week: selectedDays,
          time_slot: timeSlot,
          assigned_kiosk_id: assignedKioskId,
          include_minigame: includeMinigame,
          prescribed_exercises: prescribedExercises,
        },
      });

      window.dispatchEvent(new CustomEvent('schedule-updated'));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกตารางฝึกได้');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = (Array.isArray(patients) ? patients : []).filter(
    (p) =>
      `${p.first_name} ${p.last_name || ''} ${p.hn || ''}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <div className="text-xs uppercase font-semibold text-emerald-400 mb-1">
              {selectedPatient ? (
                <span>
                  ตารางกายภาพ: {selectedPatient.first_name} {selectedPatient.last_name} (
                  {(selectedPatient as any).patient_id || selectedPatient.hn || selectedPatient.id})
                </span>
              ) : (
                <span>สร้างตารางฝึกกายภาพบำบัดใหม่ (3-Step Wizard)</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white">
              {step === 1 && 'ขั้นตอนที่ 1: เลือกคนไข้'}
              {step === 2 && 'ขั้นตอนที่ 2: จัดท่าฝึก & ตัวเลือกมินิเกม'}
              {step === 3 && 'ขั้นตอนที่ 3: กำหนดวัน เวลา และตู้คีออส'}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Step Progress Pills */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { num: 1, label: '1. เลือกคนไข้' },
            { num: 2, label: '2. จัดท่าฝึก & มินิเกม' },
            { num: 3, label: '3. กำหนดเวลา & ตู้' },
          ].map((s) => (
            <div
              key={s.num}
              className={`py-2 px-3 rounded-xl text-xs font-semibold text-center border transition ${
                step === s.num
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                  : step > s.num
                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-slate-950 border-slate-800 text-slate-600'
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mb-4 bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* STEP 1: SELECT PATIENT */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {/* Functional Patient Selector Dropdown */}
              <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                <label htmlFor="modal-patient-select" className="text-xs font-bold text-emerald-400">
                  เลือกคนไข้ (Select Patient):
                </label>
                <select
                  id="modal-patient-select"
                  value={selectedPatient?.id || ''}
                  onChange={(e) => {
                    const match = patients.find((p) => p.id === e.target.value || p.hn === e.target.value);
                    if (match) setSelectedPatient(match);
                  }}
                  className="w-full py-2.5 px-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="" disabled>-- เลือกคนไข้จากฐานข้อมูลจริง --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name || ''} ({p.hn || p.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ นามสกุล หรือ HN คนไข้..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
                {filteredPatients.map((p) => {
                  const isSelected = selectedPatient?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-emerald-950/30 border-emerald-500 text-white'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-emerald-400">
                          {p.first_name[0] || 'P'}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">
                            {p.first_name} {p.last_name || ''}
                          </div>
                          <div className="text-xs text-slate-400">
                            HN: {p.hn || p.id} • อายุ {p.age || '-'} ปี • {p.injury || 'ทั่วไป'}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: ORGANIZE EXERCISES & MINIGAME */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              {/* Modpack Presets Buttons */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ดึงชุดท่าฝึกสำเร็จรูป (Modpack / Preset Template):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableModpacks.map((mp) => (
                    <button
                      key={mp.id}
                      type="button"
                      onClick={() => applyModpack(mp)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-emerald-300 transition"
                    >
                      [{mp.name}]
                    </button>
                  ))}
                </div>
              </div>

              {/* Prescribed Exercises List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-slate-300">
                    รายการท่าฝึกที่กำหนด ({prescribedExercises.length} ท่า)
                  </div>
                </div>

                <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto mb-3">
                  {prescribedExercises.map((ex, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate">{ex.name}</div>
                        <div className="text-slate-400">ข้อต่อ: {ex.target_joint}</div>
                      </div>

                      {/* Sets & Reps Counters */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">เซ็ต:</span>
                          <button
                            type="button"
                            onClick={() => updateExerciseSets(idx, -1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-white w-4 text-center">{ex.sets}</span>
                          <button
                            type="button"
                            onClick={() => updateExerciseSets(idx, 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">ครั้ง:</span>
                          <button
                            type="button"
                            onClick={() => updateExerciseReps(idx, -1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-white w-6 text-center">{ex.reps}</span>
                          <button
                            type="button"
                            onClick={() => updateExerciseReps(idx, 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeExercise(idx)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new individual exercise dropdown with in-development notice */}
                <div className="flex flex-col gap-2">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <span className="font-bold shrink-0">⚠️ สถานะระบบ:</span>
                    <span>ท่ากายภาพมาตรฐาน &quot;อยู่ระหว่างพัฒนา&quot; (สามารถมอบหมายมินิเกมฝึกสมองและการตอบสนองต่อท้าย)</span>
                  </div>
                  <select
                    onChange={(e) => {
                      const match = availableExercises.find((x) => x.id === e.target.value);
                      if (match) addExercise(match);
                      e.target.value = '';
                    }}
                    className="flex-1 py-2 px-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      + เพิ่มท่าฝึกจากคลัง (ท่ามาตรฐาน: อยู่ระหว่างพัฒนา)...
                    </option>
                    {availableExercises.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.target_joint}) • [อยู่ระหว่างพัฒนา]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interactive Quiz Toggle */}
              <div className="bg-purple-950/30 border border-purple-500/30 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <label
                      htmlFor="include-minigame-checkbox"
                      className="text-sm font-bold text-white cursor-pointer select-none"
                    >
                      [☑] รวมมินิเกมฝึกสมองและการตอบสนอง (Interactive Quiz) ในคอร์สประจำวัน
                    </label>
                    <div className="text-xs text-purple-300">
                      เปิดระบบคำถามฝึกการรับรู้และเสริมสร้างการฟื้นตัวของสมองหลังทำกายภาพเสร็จ
                    </div>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="include-minigame-checkbox"
                    type="checkbox"
                    checked={includeMinigame}
                    onChange={(e) => setIncludeMinigame(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: SCHEDULE & KIOSK */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              {/* Days of Week */}
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 block">
                  เลือกวันในสัปดาห์ที่นัดหมาย
                </label>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {allDaysOfWeek.map((d) => {
                    const isSelected = selectedDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDay(d.key)}
                        className={`py-2 sm:py-3 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold border transition ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">
                    วันที่เริ่มต้น
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">
                    วันที่สิ้นสุด
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Time & Kiosk */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">
                    ช่วงเวลานัดหมาย
                  </label>
                  <select
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="08:00 - 09:00">08:00 - 09:00</option>
                    <option value="09:00 - 10:00">09:00 - 10:00</option>
                    <option value="10:00 - 11:00">10:00 - 11:00</option>
                    <option value="13:00 - 14:00">13:00 - 14:00</option>
                    <option value="14:00 - 15:00">14:00 - 15:00</option>
                    <option value="15:00 - 16:00">15:00 - 16:00</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">
                    ตู้ Kiosk ประจำ
                  </label>
                  <select
                    value={assignedKioskId}
                    onChange={(e) => setAssignedKioskId(e.target.value)}
                    className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="kiosk-01">Kiosk 01 (ห้องกายภาพ 1)</option>
                    <option value="kiosk-02">Kiosk 02 (ห้องกายภาพ 2)</option>
                    <option value="kiosk-03">Kiosk 03 (ตู้ฝึกสมอง)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-4">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 flex items-center gap-1.5 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>ย้อนกลับ</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 transition"
            >
              ยกเลิก
            </button>

            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 && !selectedPatient}
                onClick={() => setStep((prev) => (prev + 1) as any)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40"
              >
                <span>ถัดไป</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveSchedule}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-950 transition active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังบันทึกตารางฝึก...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>บันทึกตารางฝึก</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
