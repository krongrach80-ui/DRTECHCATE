'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Gamepad2,
  CalendarDays,
  User,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Save,
  Check,
  Sparkles,
  Info,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Exercise } from '@/types/database';

interface PatientOption {
  id: string;
  full_name: string;
  username: string;
}

const DAYS_OF_WEEK = [
  { label: 'จันทร์', value: 1 },
  { label: 'อังคาร', value: 2 },
  { label: 'พุธ', value: 3 },
  { label: 'พฤหัส', value: 4 },
  { label: 'ศุกร์', value: 5 },
  { label: 'เสาร์', value: 6 },
  { label: 'อาทิตย์', value: 0 },
];

function PTScheduleContent() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get('patientId') || '';

  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly'>('monthly');

  // Shared Data
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // =========================================================================
  // STRICTLY ISOLATED STATE 1: MONTHLY PLAN STATE
  // =========================================================================
  const [monthlyState, setMonthlyState] = useState<{
    selectedMonth: Date;
    selectedDates: string[]; // YYYY-MM-DD
    selectedExerciseIds: string[];
  }>({
    selectedMonth: new Date(2026, 9, 1),
    selectedDates: [],
    selectedExerciseIds: [],
  });

  // =========================================================================
  // STRICTLY ISOLATED STATE 2: WEEKLY PLAN STATE (Auto-Randomized)
  // =========================================================================
  const [weeklyState, setWeeklyState] = useState<{
    startDate: string; // YYYY-MM-DD
    durationWeeks: number;
    selectedDays: number[]; // 1=Mon, 3=Wed, 5=Fri
    selectedExercisePool: string[];
    generatedItems: { scheduled_date: string; exercise_id: string; exercise_title: string }[];
  }>({
    startDate: '2026-10-22',
    durationWeeks: 4,
    selectedDays: [1, 3, 5],
    selectedExercisePool: [],
    generatedItems: [],
  });

  // Load initial accessible patients and exercises
  useEffect(() => {
    async function loadData() {
      try {
        const [patientsRes, exRes] = await Promise.all([
          fetch('/api/pt/patients'),
          fetch('/api/pt/exercises'),
        ]);

        const [patientsData, exData] = await Promise.all([
          patientsRes.json(),
          exRes.json(),
        ]);

        if (patientsData.patients) {
          setPatients(patientsData.patients);
          if (initialPatientId && patientsData.patients.some((p: PatientOption) => p.id === initialPatientId)) {
            setSelectedPatientId(initialPatientId);
          } else if (patientsData.patients.length > 0 && !selectedPatientId) {
            setSelectedPatientId(patientsData.patients[0].id);
          }
        }

        if (exData.exercises) {
          setExercises(exData.exercises);
        }
      } catch (err) {
        console.error('Failed to load scheduling data:', err);
      }
    }
    loadData();
  }, [initialPatientId, selectedPatientId]);

  // --- MONTHLY TAB HELPERS ---
  const toggleMonthlyDate = (dateStr: string) => {
    setMonthlyState((prev) => {
      const exists = prev.selectedDates.includes(dateStr);
      const newDates = exists
        ? prev.selectedDates.filter((d) => d !== dateStr)
        : [...prev.selectedDates, dateStr].sort();
      return { ...prev, selectedDates: newDates };
    });
  };

  const toggleMonthlyExercise = (exercise: Exercise) => {
    // RESTRICTION: Only minigames can be selected
    if (exercise.type !== 'minigame') return;

    setMonthlyState((prev) => {
      const exists = prev.selectedExerciseIds.includes(exercise.id);
      const newIds = exists
        ? prev.selectedExerciseIds.filter((id) => id !== exercise.id)
        : [...prev.selectedExerciseIds, exercise.id];
      return { ...prev, selectedExerciseIds: newIds };
    });
  };

  const year = monthlyState.selectedMonth.getFullYear();
  const month = monthlyState.selectedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  // --- WEEKLY TAB RANDOMIZER ---
  const handleGenerateWeeklyRandomized = () => {
    if (!weeklyState.startDate) {
      setNotification({ type: 'error', message: 'กรุณาระบุวันเริ่มต้นคอร์ส' });
      return;
    }
    if (weeklyState.selectedDays.length === 0) {
      setNotification({ type: 'error', message: 'กรุณาเลือกวันในสัปดาห์อย่างน้อย 1 วัน' });
      return;
    }
    if (weeklyState.selectedExercisePool.length === 0) {
      setNotification({ type: 'error', message: 'กรุณาเลือกมินิเกมเพื่อนำมาสุ่มตาราง' });
      return;
    }

    const items: { scheduled_date: string; exercise_id: string; exercise_title: string }[] = [];
    const startDateObj = new Date(weeklyState.startDate);
    const totalDays = weeklyState.durationWeeks * 7;

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
      const curDate = new Date(startDateObj);
      curDate.setDate(startDateObj.getDate() + dayOffset);

      if (weeklyState.selectedDays.includes(curDate.getDay())) {
        const dateStr = curDate.toISOString().split('T')[0];

        // Random pick from pool
        const randomIndex = Math.floor(Math.random() * weeklyState.selectedExercisePool.length);
        const pickedExerciseId = weeklyState.selectedExercisePool[randomIndex];
        const exerciseObj = exercises.find((e) => e.id === pickedExerciseId);

        if (exerciseObj) {
          items.push({
            scheduled_date: dateStr,
            exercise_id: exerciseObj.id,
            exercise_title: exerciseObj.title,
          });
        }
      }
    }

    setWeeklyState((prev) => ({ ...prev, generatedItems: items }));
    setNotification({
      type: 'success',
      message: `ระบบสุ่มตารางฝึกมินิเกมอัตโนมัติสำเร็จ: ทั้งหมด ${items.length} ครั้ง สำหรับระยะเวลา ${weeklyState.durationWeeks} สัปดาห์`,
    });
  };

  const toggleWeeklyExercisePool = (exercise: Exercise) => {
    // RESTRICTION: Only minigames can be selected
    if (exercise.type !== 'minigame') return;

    setWeeklyState((prev) => {
      const exists = prev.selectedExercisePool.includes(exercise.id);
      const newPool = exists
        ? prev.selectedExercisePool.filter((id) => id !== exercise.id)
        : [...prev.selectedExercisePool, exercise.id];
      return { ...prev, selectedExercisePool: newPool };
    });
  };

  const toggleWeeklyDay = (dayValue: number) => {
    setWeeklyState((prev) => {
      const exists = prev.selectedDays.includes(dayValue);
      const newDays = exists
        ? prev.selectedDays.filter((d) => d !== dayValue)
        : [...prev.selectedDays, dayValue];
      return { ...prev, selectedDays: newDays };
    });
  };

  // --- SAVE TO DATABASE ---
  const handleSavePlan = async () => {
    if (!selectedPatientId) {
      setNotification({ type: 'error', message: 'กรุณาเลือกคนไข้' });
      return;
    }

    let itemsToSave: { scheduled_date: string; exercise_id: string }[] = [];
    let startDate = '';
    let endDate = '';

    if (activeTab === 'monthly') {
      if (monthlyState.selectedDates.length === 0) {
        setNotification({ type: 'error', message: 'กรุณาเลือกวันที่ต้องการฝึกในปฏิทิน' });
        return;
      }
      if (monthlyState.selectedExerciseIds.length === 0) {
        setNotification({ type: 'error', message: 'กรุณาเลือกมินิเกมที่ต้องการมอบหมาย' });
        return;
      }

      startDate = monthlyState.selectedDates[0];
      endDate = monthlyState.selectedDates[monthlyState.selectedDates.length - 1];

      for (const d of monthlyState.selectedDates) {
        for (const exId of monthlyState.selectedExerciseIds) {
          itemsToSave.push({ scheduled_date: d, exercise_id: exId });
        }
      }
    } else {
      // Weekly Tab
      if (weeklyState.generatedItems.length === 0) {
        setNotification({ type: 'error', message: 'กรุณากด "สุ่มตารางฝึกอัตโนมัติ" ก่อนบันทึก' });
        return;
      }

      startDate = weeklyState.generatedItems[0].scheduled_date;
      endDate = weeklyState.generatedItems[weeklyState.generatedItems.length - 1].scheduled_date;

      itemsToSave = weeklyState.generatedItems.map((item) => ({
        scheduled_date: item.scheduled_date,
        exercise_id: item.exercise_id,
      }));
    }

    setSaving(true);
    setNotification(null);

    try {
      const res = await fetch('/api/pt/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          mode: activeTab,
          start_date: startDate,
          end_date: endDate,
          items: itemsToSave,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกคอร์สไม่สำเร็จ');
      }

      setNotification({
        type: 'success',
        message: `บันทึกคอร์สฝึกมินิเกมลงฐานข้อมูลเรียบร้อยแล้ว (${data.itemCount || itemsToSave.length} รายการ)`,
      });

      // Clear state after save
      if (activeTab === 'monthly') {
        setMonthlyState((prev) => ({ ...prev, selectedDates: [], selectedExerciseIds: [] }));
      } else {
        setWeeklyState((prev) => ({ ...prev, generatedItems: [] }));
      }
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-900/40 border border-slate-800 backdrop-blur-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>จ่ายคอร์สมินิเกมฟื้นฟู (PT Minigame Prescription)</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">จัดตารางฝึกมินิเกมสำหรับคนไข้</h1>
          <p className="text-xs text-slate-400 mt-1">
            เลือกจ่ายมินิเกมฟื้นฟูแบบระบุวันรายเดือน หรือสุ่มกระจายอัตโนมัติตลอดสัปดาห์ (ท่ากายภาพอยู่ในระหว่างพัฒนา)
          </p>
        </div>

        {/* Global Save Button */}
        <button
          type="button"
          onClick={handleSavePlan}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'กำลังบันทึกลงระบบ...' : 'บันทึกคอร์สฝึก'}</span>
        </button>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Patient Selection Card */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 whitespace-nowrap">
          <User className="w-4 h-4 text-emerald-400" />
          <span>คนไข้ที่รับการฝึก:</span>
        </div>
        <select
          value={selectedPatientId}
          onChange={(e) => setSelectedPatientId(e.target.value)}
          aria-label="เลือกคนไข้สำหรับจัดตารางฝึกมินิเกม"
          className="w-full md:w-80 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          {patients.length === 0 ? (
            <option value="">ไม่มีคนไข้ในความดูแล</option>
          ) : (
            patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.username})
              </option>
            ))
          )}
        </select>
        <span className="text-[11px] text-slate-500">
          (กรองเฉพาะคนไข้ที่อยู่ในความดูแลของท่าน หรือได้รับมอบหมายผ่านการฝากเคส)
        </span>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('monthly')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'monthly'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>โหมด 1: รายเดือน (เลือกวันที่แบบระบุวันเอง)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('weekly')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'weekly'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shuffle className="w-4 h-4" />
          <span>โหมด 2: รายสัปดาห์ (สุ่มมินิเกมอัตโนมัติ Auto-Randomize)</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: MONTHLY PLANNER (Individual Day Picker)
         ===================================================================== */}
      {activeTab === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Calendar Picker (7 Cols) */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">
                  {monthlyState.selectedMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setMonthlyState((prev) => ({
                      ...prev,
                      selectedMonth: new Date(prev.selectedMonth.getFullYear(), prev.selectedMonth.getMonth() - 1, 1),
                    }))
                  }
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMonthlyState((prev) => ({
                      ...prev,
                      selectedMonth: new Date(prev.selectedMonth.getFullYear(), prev.selectedMonth.getMonth() + 1, 1),
                    }))
                  }
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => (
                <div key={d} className="py-1 text-slate-500 font-semibold">
                  {d}
                </div>
              ))}

              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="p-2" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = monthlyState.selectedDates.includes(dStr);

                return (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => toggleMonthlyDate(dStr)}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                        : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800/80'
                    }`}
                  >
                    <span className="text-xs">{dayNum}</span>
                    {isSelected && <span className="text-[9px] leading-none">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] text-slate-400 pt-2 flex items-center justify-between">
              <span>เลือกแล้ว {monthlyState.selectedDates.length} วัน</span>
              {monthlyState.selectedDates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMonthlyState((prev) => ({ ...prev, selectedDates: [] }))}
                  className="text-rose-400 hover:underline"
                >
                  ล้างวันที่เลือกทั้งหมด
                </button>
              )}
            </div>
          </div>

          {/* Exercise Selection (5 Cols) with Strict Minigame Restriction */}
          <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">เลือกมินิเกมที่ต้องการมอบหมาย</h3>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono">
                {monthlyState.selectedExerciseIds.length} เกม
              </span>
            </div>

            {/* Clinical Rule Notice */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                นักกายภาพบำบัด (PT) ได้รับอนุญาตให้จ่ายเฉพาะ <strong>มินิเกม</strong> เท่านั้น ท่ากายภาพบำบัดกำลังอยู่ในระหว่างพัฒนา
              </span>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {exercises.map((ex) => {
                const isMinigame = ex.type === 'minigame';
                const isSelected = monthlyState.selectedExerciseIds.includes(ex.id);

                if (!isMinigame) {
                  // Greyed out, disabled
                  return (
                    <div
                      key={ex.id}
                      className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 opacity-40 cursor-not-allowed flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-400 text-xs">{ex.title}</div>
                        <div className="text-[10px] text-slate-500">ส่วนที่ฝึก: {ex.body_area}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-amber-400 border border-amber-500/20">
                        อยู่ระหว่างพัฒนา (แพทย์/Admin)
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => toggleMonthlyExercise(ex)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <span>{ex.title}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300">
                          มินิเกม
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">ส่วนที่ฝึก: {ex.body_area}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: WEEKLY AUTO-RANDOMIZER
         ===================================================================== */}
      {activeTab === 'weekly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls & Minigame Pool (6 Cols) */}
          <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white text-sm">ตั้งค่าระบบสุ่มมินิเกมรายสัปดาห์</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">วันเริ่มต้นคอร์ส</label>
                <input
                  type="date"
                  value={weeklyState.startDate}
                  onChange={(e) => setWeeklyState((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">ระยะเวลาต่อเนื่อง</label>
                <select
                  value={weeklyState.durationWeeks}
                  onChange={(e) => setWeeklyState((prev) => ({ ...prev, durationWeeks: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={2}>2 สัปดาห์</option>
                  <option value={4}>4 สัปดาห์ (1 เดือน)</option>
                  <option value={8}>8 สัปดาห์ (2 เดือน)</option>
                  <option value={12}>12 สัปดาห์ (3 เดือน)</option>
                </select>
              </div>
            </div>

            {/* Days of Week Selection */}
            <div>
              <label className="block text-slate-300 font-medium text-xs mb-2">
                เลือกวันที่ต้องการให้เข้าฝึกในแต่ละสัปดาห์:
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS_OF_WEEK.map((d) => {
                  const isSelected = weeklyState.selectedDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleWeeklyDay(d.value)}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minigame Pool Selector */}
            <div className="space-y-2">
              <label className="block text-slate-300 font-medium text-xs">
                เลือกมินิเกมที่ต้องการนำมาสุ่ม (Pool):
              </label>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {exercises.map((ex) => {
                  const isMinigame = ex.type === 'minigame';
                  const isSelected = weeklyState.selectedExercisePool.includes(ex.id);

                  if (!isMinigame) {
                    return (
                      <div
                        key={ex.id}
                        className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/40 opacity-40 cursor-not-allowed flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-400">{ex.title}</span>
                        <span className="text-[10px] text-amber-400">อยู่ระหว่างพัฒนา</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => toggleWeeklyExercisePool(ex)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="font-medium">{ex.title}</span>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                            : 'border-slate-700 bg-slate-900'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateWeeklyRandomized}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span>สุ่มตารางฝึกอัตโนมัติ (Generate Randomized Schedule)</span>
            </button>
          </div>

          {/* Generated Result Preview (6 Cols) */}
          <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">
                  ผลการสุ่มตารางฝึก ({weeklyState.generatedItems.length} ครั้ง)
                </h3>
              </div>
              {weeklyState.generatedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWeeklyState((prev) => ({ ...prev, generatedItems: [] }))}
                  className="text-xs text-rose-400 hover:underline"
                >
                  ล้างตาราง
                </button>
              )}
            </div>

            {weeklyState.generatedItems.length === 0 ? (
              <div className="p-12 text-center text-slate-500 rounded-xl border border-dashed border-slate-800">
                <Shuffle className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="text-xs">ยังไม่มีตารางที่สุ่ม</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  เลือกวันในสัปดาห์และมินิเกม แล้วกดปุ่ม &quot;สุ่มตารางฝึกอัตโนมัติ&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {weeklyState.generatedItems.map((item, idx) => {
                  const dateObj = new Date(item.scheduled_date);
                  const thaiDay = DAYS_OF_WEEK.find((d) => d.value === dateObj.getDay())?.label || '';

                  return (
                    <div
                      key={`${item.scheduled_date}-${idx}`}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold flex items-center justify-center text-[11px]">
                          {thaiDay}
                        </div>
                        <div>
                          <div className="font-bold text-white">{item.exercise_title}</div>
                          <div className="text-[10px] text-slate-400">{item.scheduled_date}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                        รอเข้าฝึก
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PTSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-400">
          <Gamepad2 className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
          <span>กำลังโหลดระบบจัดตารางฝึกมินิเกม...</span>
        </div>
      }
    >
      <PTScheduleContent />
    </Suspense>
  );
}
