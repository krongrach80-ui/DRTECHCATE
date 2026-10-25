/**
 * apps/admin/src/smart-portal/SmartScheduleView.tsx
 * Simplified Schedule Manager UI (Master Prompt v4 Section 4.1)
 * 2 Tabs: Today's Queue & Weekly Calendar View + 3-Step Wizard Trigger
 */

import React, { useState, useEffect } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { SmartScheduleWizardModal } from './SmartScheduleWizardModal';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  RefreshCw,
  Activity,
  Hourglass,
} from 'lucide-react';

interface QueueItem {
  patient_id: string;
  patient_name: string;
  hn: string;
  time_slot: string;
  modpack_name: string;
  status: 'waiting' | 'in_progress' | 'completed';
  include_minigame: boolean;
  kiosk_id: string;
}

export const SmartScheduleView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'today' | 'weekly'>('today');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Today's appointments queue
  const [todayQueue, setTodayQueue] = useState<QueueItem[]>([]);

  // Weekly calendar columns (Mon - Sun)
  const daysOfWeek = [
    { key: 'Mon', label: 'จันทร์', thai: 'วันจันทร์' },
    { key: 'Tue', label: 'อังคาร', thai: 'วันอังคาร' },
    { key: 'Wed', label: 'พุธ', thai: 'วันพุธ' },
    { key: 'Thu', label: 'พฤหัสบดี', thai: 'วันพฤหัสบดี' },
    { key: 'Fri', label: 'ศุกร์', thai: 'วันศุกร์' },
    { key: 'Sat', label: 'เสาร์', thai: 'วันเสาร์' },
    { key: 'Sun', label: 'อาทิตย์', thai: 'วันอาทิตย์' },
  ];

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      const patients = await defaultApiClient.patients.list().catch(() => []);

      // Extract patients with active schedules
      const queue: QueueItem[] = [];

      for (const p of patients) {
        // Query daily plan or schedule info
        const daily = await defaultApiClient.smartOnboarding
          .getDailyPlan(p.id)
          .catch(() => null);

        if (daily && daily.is_scheduled_today) {
          queue.push({
            patient_id: p.id,
            patient_name: `${p.first_name} ${p.last_name || ''}`,
            hn: p.hn || p.id,
            time_slot: daily.schedule?.time_slot || '09:00 - 10:00',
            modpack_name:
              daily.schedule?.prescribed_exercises?.length > 0
                ? `${daily.schedule.prescribed_exercises.length} ท่ากายภาพ`
                : 'คอร์สฟื้นฟูกายภาพ',
            status: 'waiting',
            include_minigame: daily.include_minigame,
            kiosk_id: daily.schedule?.assigned_kiosk_id || 'Kiosk-01',
          });
        }
      }

      setTodayQueue(queue);
    } catch {
      // non-blocking
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduleData();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="text-xs uppercase font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            <span>Smart Physical Therapy Schedule Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            ตารางฝึกกายภาพบำบัด
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            จัดการคิวกายภาพประจำวัน ซิงค์แบบ Real-time ตรงสู่หน้าตู้ Kiosk ทุกเครื่อง
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchScheduleData}
            className="p-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs transition"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950 flex items-center gap-2 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ สร้างตารางฝึกใหม่ (New Schedule)</span>
          </button>
        </div>
      </div>

      {/* View Switcher: 2 Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'today'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>📅 นัดหมายวันนี้ (Today&apos;s Queue)</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-950/40 text-[10px]">
            {todayQueue.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('weekly')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'weekly'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>🗓️ มุมมองปฏิทินรายสัปดาห์ (Weekly Calendar)</span>
        </button>
      </div>

      {/* Tab 1: Today's Queue */}
      {activeTab === 'today' && (
        <div className="flex flex-col gap-4">
          {todayQueue.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center flex flex-col items-center justify-center">
              <Clock className="w-10 h-10 text-slate-600 mb-3" />
              <div className="text-sm font-semibold text-slate-300">
                ยังไม่มีคิวนัดหมายสำหรับวันนี้
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mb-4">
                คุณสามารถเพิ่มตารางฝึกใหม่ให้คนไข้ได้ทันทีโดยกดปุ่ม &quot;สร้างตารางฝึกใหม่&quot;
              </p>
              <button
                type="button"
                onClick={() => setIsWizardOpen(true)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold"
              >
                + เพิ่มคิวนัดหมายแรกของวันนี้
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayQueue.map((item) => (
                <div
                  key={item.patient_id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between gap-4 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-base">
                        {item.patient_name[0] || 'P'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white truncate max-w-[160px]">
                          {item.patient_name}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          HN: {item.hn}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold flex items-center gap-1">
                      <Hourglass className="w-3 h-3" />
                      <span>รอเข้าฝึก</span>
                    </span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ช่วงเวลา:</span>
                      <span className="font-semibold text-white">{item.time_slot}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ชุดท่าฝึก:</span>
                      <span className="font-semibold text-emerald-400">{item.modpack_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">มินิเกมฝึกสมอง:</span>
                      <span className={item.include_minigame ? 'text-purple-400 font-semibold' : 'text-slate-500'}>
                        {item.include_minigame ? 'เปิดใช้งาน' : 'ปิด'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ตู้ Kiosk:</span>
                      <span className="font-mono text-slate-300">{item.kiosk_id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Weekly Calendar */}
      {activeTab === 'weekly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {daysOfWeek.map((day) => (
            <div
              key={day.key}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 min-h-[300px]"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-emerald-400">{day.thai}</span>
                <span className="text-[10px] uppercase font-mono text-slate-500">
                  {day.key}
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-300">
                  <div className="font-bold text-white mb-0.5">คอร์สฟื้นฟูไหล่ติด</div>
                  <div className="text-slate-400 text-[10px]">09:00 - 10:00 • Kiosk 01</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsWizardOpen(true)}
                className="w-full py-2 rounded-xl border border-dashed border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-300 text-[11px] font-semibold transition"
              >
                + เพิ่มนัดหมาย
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 3-Step Wizard Modal */}
      {isWizardOpen && (
        <SmartScheduleWizardModal
          isOpen={true}
          onClose={() => setIsWizardOpen(false)}
          onSuccess={() => {
            fetchScheduleData();
            setIsWizardOpen(false);
          }}
        />
      )}
    </div>
  );
};
