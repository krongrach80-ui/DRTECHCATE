'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Dumbbell,
  User,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Save,
  Check,
  CalendarDays,
} from 'lucide-react';
import { Exercise } from '@/types/database';

interface UserOption {
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

export default function AdminSchedulePage() {
  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly'>('monthly');

  // Shared Selection
  const [patients, setPatients] = useState<UserOption[]>([]);
  const [pts, setPts] = useState<UserOption[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedPtId, setSelectedPtId] = useState<string>('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // =========================================================================
  // STRICTLY ISOLATED STATE 1: MONTHLY PLAN STATE
  // =========================================================================
  const [monthlyState, setMonthlyState] = useState<{
    selectedMonth: Date; // e.g., current month
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
    selectedDays: [1, 3, 5], // Default: Mon, Wed, Fri
    selectedExercisePool: [],
    generatedItems: [],
  });

  // Load patients, PTs, and exercises on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [patientsRes, ptsRes, exRes] = await Promise.all([
          fetch('/api/admin/users?role=patient'),
          fetch('/api/admin/users?role=pt'),
          fetch('/api/admin/exercises'),
        ]);

        const [patientsData, ptsData, exData] = await Promise.all([
          patientsRes.json(),
          ptsRes.json(),
          exRes.json(),
        ]);

        if (patientsData.users) setPatients(patientsData.users);
        if (ptsData.users) setPts(ptsData.users);
        if (exData.exercises) setExercises(exData.exercises.filter((e: Exercise) => e.is_active));

        if (patientsData.users?.length > 0) setSelectedPatientId(patientsData.users[0].id);
        if (ptsData.users?.length > 0) setSelectedPtId(ptsData.users[0].id);
      } catch (err) {
        console.error('Failed to load initial scheduling data:', err);
      }
    }
    loadInitialData();
  }, []);

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

  const toggleMonthlyExercise = (exerciseId: string) => {
    setMonthlyState((prev) => {
      const exists = prev.selectedExerciseIds.includes(exerciseId);
      const newIds = exists
        ? prev.selectedExerciseIds.filter((id) => id !== exerciseId)
        : [...prev.selectedExerciseIds, exerciseId];
      return { ...prev, selectedExerciseIds: newIds };
    });
  };

  // Calendar calculation for Monthly Tab
  const year = monthlyState.selectedMonth.getFullYear();
  const month = monthlyState.selectedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday

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
      setNotification({ type: 'error', message: 'กรุณาเลือกท่าฝึก/มินิเกมในคลังเพื่อนำมาสุ่ม' });
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
        // Randomly pick an exercise from the selected pool
        const randomIndex = Math.floor(Math.random() * weeklyState.selectedExercisePool.length);
        const chosenExerciseId = weeklyState.selectedExercisePool[randomIndex];
        const exObj = exercises.find((e) => e.id === chosenExerciseId);

        items.push({
          scheduled_date: dateStr,
          exercise_id: chosenExerciseId,
          exercise_title: exObj ? exObj.title : 'ท่ากายภาพ',
        });
      }
    }

    // Save randomized result into weeklyState
    setWeeklyState((prev) => ({
      ...prev,
      generatedItems: items,
    }));

    setNotification({
      type: 'success',
      message: `ระบบสุ่มจัดตารางฝึกอัตโนมัติสำเร็จ (${items.length} ครั้งตลอด ${weeklyState.durationWeeks} สัปดาห์) ผลลัพธ์ถูกล็อกไว้พร้อมบันทึก`,
    });
  };

  // --- SAVE COURSE HANDLER ---
  const handleSaveCourse = async () => {
    if (!selectedPatientId || !selectedPtId) {
      setNotification({ type: 'error', message: 'กรุณาเลือกคนไข้และนักกายภาพบำบัด' });
      return;
    }

    let itemsToSave: { scheduled_date: string; exercise_id: string }[] = [];
    let startDate = '';
    let endDate = '';

    if (activeTab === 'monthly') {
      if (monthlyState.selectedDates.length === 0) {
        setNotification({ type: 'error', message: 'กรุณาเลือกวันที่ต้องการจัดคอร์สอย่างน้อย 1 วัน' });
        return;
      }
      if (monthlyState.selectedExerciseIds.length === 0) {
        setNotification({ type: 'error', message: 'กรุณาเลือกท่าฝึก/มินิเกมสำหรับวันดังกล่าว' });
        return;
      }

      const sortedDates = [...monthlyState.selectedDates].sort();
      startDate = sortedDates[0];
      endDate = sortedDates[sortedDates.length - 1];

      // Assign all selected exercises to each chosen date
      sortedDates.forEach((dateStr) => {
        monthlyState.selectedExerciseIds.forEach((exId) => {
          itemsToSave.push({ scheduled_date: dateStr, exercise_id: exId });
        });
      });
    } else {
      // Weekly Tab: uses fixed randomized items
      if (weeklyState.generatedItems.length === 0) {
        setNotification({ type: 'error', message: 'กรุณากดปุ่ม "สุ่มจัดตารางฝึกอัตโนมัติ" ก่อนบันทึก' });
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
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          pt_id: selectedPtId,
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
        message: `บันทึกคอร์สฝึกสำเร็จ! ข้อมูลถูกบันทึกลง course_items ในฐานข้อมูลแล้ว (${itemsToSave.length} รายการ)`,
      });
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <CalendarIcon className="w-7 h-7 text-sky-400" />
          <span>ตารางนัดหมาย & จัดคอร์สฝึก (Schedule & Course Planner)</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          ระบบจัดคอร์สกายภาพบำบัด 2 รูปแบบที่มี State แยกขาดจากกันจริง: รายเดือน (เลือกวันทีละวัน) หรือ รายอาทิตย์ (สุ่มอัตโนมัติและบันทึกถาวร)
        </p>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
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

      {/* Patient & PT Selectors */}
      <div className="glass-panel rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="w-4 h-4 text-indigo-400" />
            <span>คนไข้ที่รับการฝึก *</span>
          </label>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {patients.length === 0 ? (
              <option value="">ไม่มีรายชื่อคนไข้ (สร้างในหน้าจัดการผู้ใช้)</option>
            ) : (
              patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} (@{p.username})
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>นักกายภาพบำบัดผู้ดูแล *</span>
          </label>
          <select
            value={selectedPtId}
            onChange={(e) => setSelectedPtId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {pts.length === 0 ? (
              <option value="">ไม่มีรายชื่อ PT</option>
            ) : (
              pts.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.full_name} (@{pt.username})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Tab Switcher: Isolated State Demonstration */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('monthly')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'monthly'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>แท็บ 1: คอร์สรายเดือน (จิ้มเลือกวันทีละวัน)</span>
          {monthlyState.selectedDates.length > 0 && (
            <span className="bg-sky-500 text-white px-2 py-0.5 rounded-full text-[10px]">
              {monthlyState.selectedDates.length} วัน
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('weekly')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'weekly'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Shuffle className="w-4 h-4" />
          <span>แท็บ 2: คอร์สรายอาทิตย์ (สุ่มอัตโนมัติ & ล็อกผล)</span>
          {weeklyState.generatedItems.length > 0 && (
            <span className="bg-purple-500 text-white px-2 py-0.5 rounded-full text-[10px]">
              {weeklyState.generatedItems.length} ครั้ง
            </span>
          )}
        </button>
      </div>

      {/* TAB CONTENT 1: MONTHLY PLAN */}
      {activeTab === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          {/* Calendar Picker (7 Cols) */}
          <div className="lg:col-span-7 glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white text-sm flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-sky-400" />
                <span>
                  {monthlyState.selectedMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </span>
              </h2>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setMonthlyState((prev) => ({
                      ...prev,
                      selectedMonth: new Date(prev.selectedMonth.getFullYear(), prev.selectedMonth.getMonth() - 1, 1),
                    }))
                  }
                  className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white"
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
                  className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day Header */}
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-2">
              <div>อา.</div>
              <div>จ.</div>
              <div>อ.</div>
              <div>พ.</div>
              <div>พฤ.</div>
              <div>ศ.</div>
              <div>ส.</div>
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {/* Empty leading days */}
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10" />
              ))}

              {/* Day numbers */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = monthlyState.selectedDates.includes(dStr);

                return (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => toggleMonthlyDate(dStr)}
                    className={`h-10 rounded-xl flex flex-col items-center justify-center font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-white font-bold shadow-md shadow-sky-500/20'
                        : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{dayNum}</span>
                    {isSelected && <span className="w-1 h-1 rounded-full bg-white mt-0.5" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>จิ้มวันที่บนปฏิทินเพื่อเพิ่ม/เอาออก</span>
              <span className="text-sky-300 font-semibold">เลือกแล้ว {monthlyState.selectedDates.length} วัน</span>
            </div>
          </div>

          {/* Exercise Picker for Monthly (5 Cols) */}
          <div className="lg:col-span-5 glass-panel rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-sky-400" />
                <span>เลือกท่าฝึก / มินิเกมที่จะให้ทำในวันที่เลือก</span>
              </h2>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {exercises.length === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center">ยังไม่มีท่าฝึกในคลัง</div>
                ) : (
                  exercises.map((ex) => {
                    const isChecked = monthlyState.selectedExerciseIds.includes(ex.id);
                    return (
                      <div
                        key={ex.id}
                        onClick={() => toggleMonthlyExercise(ex.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-sky-500/15 border-sky-500/40 text-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-white">{ex.title}</div>
                          <div className="text-[10px] text-slate-400">{ex.body_area}</div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                            isChecked ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-700'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800 mt-6">
              <button
                type="button"
                onClick={handleSaveCourse}
                disabled={saving || monthlyState.selectedDates.length === 0 || monthlyState.selectedExerciseIds.length === 0}
                className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl glow-btn flex items-center justify-center gap-2 text-xs cursor-pointer transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'กำลังบันทึกคอร์ส...' : 'บันทึกคอร์สรายเดือนลงฐานข้อมูล'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: WEEKLY AUTO-RANDOMIZED PLAN */}
      {activeTab === 'weekly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          {/* Configuration Panel (5 Cols) */}
          <div className="lg:col-span-5 glass-panel rounded-2xl p-6 space-y-5">
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>ตั้งค่าเงื่อนไขการสุ่มตารางอัตโนมัติ</span>
            </h2>

            {/* Start Date */}
            <div>
              <label className="block text-xs text-slate-300 mb-1 font-semibold">วันเริ่มต้นคอร์ส *</label>
              <input
                type="date"
                value={weeklyState.startDate}
                onChange={(e) => setWeeklyState({ ...weeklyState, startDate: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs text-slate-300 mb-1 font-semibold">ระยะเวลาคอร์ส</label>
              <select
                value={weeklyState.durationWeeks}
                onChange={(e) => setWeeklyState({ ...weeklyState, durationWeeks: parseInt(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value={2}>2 สัปดาห์</option>
                <option value={4}>4 สัปดาห์ (1 เดือน)</option>
                <option value={8}>8 สัปดาห์ (2 เดือน)</option>
                <option value={12}>12 สัปดาห์ (3 เดือน)</option>
              </select>
            </div>

            {/* Days of week selector */}
            <div>
              <label className="block text-xs text-slate-300 mb-1.5 font-semibold">วันที่จะให้ฝึกในแต่ละสัปดาห์</label>
              <div className="grid grid-cols-4 gap-1.5">
                {DAYS_OF_WEEK.map((d) => {
                  const isChecked = weeklyState.selectedDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => {
                        const newDays = isChecked
                          ? weeklyState.selectedDays.filter((val) => val !== d.value)
                          : [...weeklyState.selectedDays, d.value];
                        setWeeklyState({ ...weeklyState, selectedDays: newDays });
                      }}
                      className={`py-2 px-2 rounded-xl text-[11px] font-medium border text-center transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-sm'
                          : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Exercise Pool to Randomize from */}
            <div>
              <label className="block text-xs text-slate-300 mb-1.5 font-semibold">
                คัดเลือกท่าฝึก/มินิเกมที่จะนำมาสุ่ม ({weeklyState.selectedExercisePool.length} รายการ)
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {exercises.map((ex) => {
                  const isChecked = weeklyState.selectedExercisePool.includes(ex.id);
                  return (
                    <div
                      key={ex.id}
                      onClick={() => {
                        const newPool = isChecked
                          ? weeklyState.selectedExercisePool.filter((id) => id !== ex.id)
                          : [...weeklyState.selectedExercisePool, ex.id];
                        setWeeklyState({ ...weeklyState, selectedExercisePool: newPool });
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-purple-600/15 border-purple-500/40 text-white'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="truncate">{ex.title}</span>
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isChecked ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-700'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Randomize Action Button */}
            <button
              type="button"
              onClick={handleGenerateWeeklyRandomized}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer transition-all shadow-lg shadow-purple-600/20"
            >
              <Shuffle className="w-4 h-4" />
              <span>สุ่มจัดตารางฝึกอัตโนมัติ (Generate Random Schedule)</span>
            </button>
          </div>

          {/* Generated Result Table (7 Cols) */}
          <div className="lg:col-span-7 glass-panel rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-white text-sm flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-purple-400" />
                    <span>ผลลัพธ์ตารางฝึกที่สุ่มได้ ({weeklyState.generatedItems.length} รายการ)</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ผลลัพธ์นี้จะถูกบันทึกถาวรลงฐานข้อมูล จะไม่ถูกสุ่มใหม่ซ้ำซ้อนเมื่อกลับเข้ามาดู
                  </p>
                </div>
              </div>

              {/* Table of Generated Items */}
              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-[11px] sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">ลำดับ</th>
                      <th className="px-4 py-2.5 font-semibold">วันที่กำหนดฝึก</th>
                      <th className="px-4 py-2.5 font-semibold">ท่าฝึก / มินิเกมที่สุ่มได้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {weeklyState.generatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-16 text-center text-slate-500">
                          ยังไม่มีข้อมูล กรุณากดปุ่ม "สุ่มจัดตารางฝึกอัตโนมัติ" ด้านซ้าย
                        </td>
                      </tr>
                    ) : (
                      weeklyState.generatedItems.map((item, idx) => (
                        <tr key={`${item.scheduled_date}-${idx}`} className="hover:bg-slate-900/40">
                          <td className="px-4 py-2 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="px-4 py-2 font-mono text-white font-medium">
                            {new Date(item.scheduled_date).toLocaleDateString('th-TH', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-2 text-purple-300 font-medium">{item.exercise_title}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Save Button for Weekly Plan */}
            <div className="pt-6 border-t border-slate-800 mt-6">
              <button
                type="button"
                onClick={handleSaveCourse}
                disabled={saving || weeklyState.generatedItems.length === 0}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer transition-all shadow-lg shadow-purple-600/20"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saving
                    ? 'กำลังบันทึกคอร์ส...'
                    : `บันทึกคอร์สรายอาทิตย์ถาวร (${weeklyState.generatedItems.length} ครั้ง) ลง course_items`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
