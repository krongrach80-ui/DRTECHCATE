/**
 * apps/admin/src/clinical-ui/ClinicalScheduleView.tsx
 * Master Prompt v5 Section 4.4: Clinical Schedule Planner, 4 KPI Cards & Monthly Grid Calendar
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  User,
  Activity,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import {
  MedicalCard,
  StatusBadge,
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { defaultApiClient, PatientRecord } from '../../../../packages/api-client/src/index.js';

interface ClinicalScheduleViewProps {
  onOpenCreateScheduleModal: (patientId?: string) => void;
}

export const ClinicalScheduleView: React.FC<ClinicalScheduleViewProps> = ({
  onOpenCreateScheduleModal,
}) => {
  const [calendarMode, setCalendarMode] = useState<'individual' | 'all'>('individual');
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Current month state (October 2569 / 2026)
  const [currentYear] = useState(2026);
  const [currentMonthIndex] = useState(9); // 0-indexed: 9 = October

  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const list = await defaultApiClient.patients.list();
      setPatients(list);
      setSelectedPatient((prev) => prev ?? (list.length > 0 ? list[0] : null));
    } catch {
      // non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Calendar dates generation (October has 31 days)
  const daysOfWeek = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const daysInMonth = 31;
  const firstDayOffset = 4; // Thursday

  return (
    <div className="p-8 space-y-6 font-sans">
      {/* 1. Header with Active Patient Card */}
      <MedicalCard className="p-6 bg-white border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center font-bold text-xl shadow-md">
              <User className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold text-slate-400">
                  HN: {selectedPatient?.hn || 'P-0001'}
                </span>
                <StatusBadge variant="active" text="กำลังเข้ารับการฟื้นฟู (Active)" />
              </div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">
                {selectedPatient
                  ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
                  : 'นายสมชาย ใจดี'}
              </h2>
              <p className="text-xs text-slate-500">
                การวินิจฉัย: {selectedPatient?.injury || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)'} • PT ผู้รับผิดชอบ: กภ. ปิยะมาศ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Change Patient Dropdown / Trigger */}
            <select
              value={selectedPatient?.id || ''}
              onChange={(e) => {
                const found = patients.find((p) => p.id === e.target.value);
                if (found) setSelectedPatient(found);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition focus:outline-none"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({p.hn})
                </option>
              ))}
            </select>

            <SmoothButton
              variant="primary"
              size="md"
              onClick={() => onOpenCreateScheduleModal(selectedPatient?.id)}
              icon={<Plus className="w-4 h-4" />}
            >
              <span>+ สร้างตารางฝึกใหม่</span>
            </SmoothButton>
          </div>
        </div>
      </MedicalCard>

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
            <div className="text-2xl font-black text-slate-800 mt-1">24 นัด</div>
            <span className="text-[11px] text-emerald-600 font-medium">สม่ำเสมอ 92%</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CalendarIcon className="w-6 h-6" />
          </div>
        </MedicalCard>

        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">กำลังรักษา (Active)</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">16 นัด</div>
            <span className="text-[11px] text-slate-400 font-medium">สัปดาห์ละ 3 วัน</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Activity className="w-6 h-6" />
          </div>
        </MedicalCard>

        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">พักชั่วคราว (Paused)</span>
            <div className="text-2xl font-black text-amber-600 mt-1">2 นัด</div>
            <span className="text-[11px] text-amber-600 font-medium">ลาพักฟื้น</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <PauseCircle className="w-6 h-6" />
          </div>
        </MedicalCard>

        <MedicalCard className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">สำเร็จแล้ว (Completed)</span>
            <div className="text-2xl font-black text-sky-600 mt-1">6 นัด</div>
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
            <span className="text-xs text-slate-400 font-medium">(ตุลาคม 2569)</span>
          </div>

          {/* Status Dots Legend */}
          <div className="flex items-center gap-4 text-xs font-semibold select-none">
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
            <div key={`empty-${i}`} className="h-28 rounded-2xl bg-slate-50/50 border border-transparent" />
          ))}

          {/* Active Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const isToday = dayNum === 24; // 24 October 2026
            const hasSession = [2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28, 30].includes(dayNum);
            const isPaused = [9].includes(dayNum);
            const isCompleted = dayNum < 24 && hasSession && !isPaused;

            return (
              <div
                key={dayNum}
                className={`group h-28 p-2.5 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between ${
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

                {/* Session pill preview if scheduled */}
                {hasSession ? (
                  <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-1 rounded-lg truncate">
                    09:00 ข้อไหล่ติด (3 ท่า)
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-300">พักฟื้น</div>
                )}

                {/* Hover Add Course Button */}
                <button
                  type="button"
                  onClick={() => onOpenCreateScheduleModal(selectedPatient?.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-full py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold text-center"
                >
                  + จัดคอร์สวันนี้
                </button>
              </div>
            );
          })}
        </div>
      </MedicalCard>
    </div>
  );
};
