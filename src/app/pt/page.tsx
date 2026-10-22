'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  FilePlus,
  Gamepad2,
  ArrowLeftRight,
  ShieldCheck,
  Activity,
  ArrowRight,
} from 'lucide-react';

interface DashboardStats {
  totalPatients: number;
  primaryPatients: number;
  transferredPatients: number;
  activeTransfers: number;
}

export default function PTDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    primaryPatients: 0,
    transferredPatients: 0,
    activeTransfers: 0,
  });
  const [recentPatients, setRecentPatients] = useState<
    Array<{
      id: string;
      full_name: string;
      username: string;
      careType: string;
      diagnosis?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOverview() {
      try {
        const [resPatients, resTransfers] = await Promise.all([
          fetch('/api/pt/patients'),
          fetch('/api/pt/case-transfers'),
        ]);

        if (resPatients.ok) {
          const pData = await resPatients.json();
          const pList = pData.patients || [];
          const primaryCount = pList.filter((p: { careType: string }) => p.careType === 'primary').length;
          const transferCount = pList.filter((p: { careType: string }) => p.careType === 'transferred').length;

          setStats((prev) => ({
            ...prev,
            totalPatients: pList.length,
            primaryPatients: primaryCount,
            transferredPatients: transferCount,
          }));

          setRecentPatients(
            pList.slice(0, 5).map((p: { id: string; full_name: string; username: string; careType: string; patients?: { diagnosis?: string } }) => ({
              id: p.id,
              full_name: p.full_name,
              username: p.username,
              careType: p.careType,
              diagnosis: p.patients?.diagnosis,
            }))
          );
        }

        if (resTransfers.ok) {
          const tData = await resTransfers.json();
          const tList = tData.transfers || [];
          const activeCount = tList.filter((t: { isCurrentlyActive: boolean }) => t.isCurrentlyActive).length;
          setStats((prev) => ({
            ...prev,
            activeTransfers: activeCount,
          }));
        }
      } catch (err) {
        console.error('Failed to load PT overview stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadOverview();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-900/40 border border-slate-800 backdrop-blur-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>RLS Protected • Physiotherapist Portal</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">ภาพรวมการดูแลรักษาทางกายภาพบำบัด</h1>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
          ระบบบริหารจัดการคนไข้ เวชระเบียนแบบ Append-Only และการจ่ายคอร์สมินิเกมฟื้นฟูเฉพาะบุคคล
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Patients */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>คนไข้ทั้งหมดในความดูแล</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {loading ? '...' : stats.totalPatients}
          </div>
          <div className="text-[11px] text-slate-400">
            คนไข้หลัก {stats.primaryPatients} คน • เคสรับฝาก {stats.transferredPatients} คน
          </div>
        </div>

        {/* KPI 2: Active Case Transfers */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>เคสที่ฝากมีผลปัจจุบัน</span>
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {loading ? '...' : stats.activeTransfers}
          </div>
          <div className="text-[11px] text-amber-400">
            จำกัดการเข้าถึงตามช่วงวันที่กำหนด
          </div>
        </div>

        {/* KPI 3: Append-Only Notes */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>มาตรฐานเวชระเบียน</span>
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
              <FilePlus className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-white mt-1">
            Append-Only
          </div>
          <div className="text-[11px] text-blue-400">
            บันทึกถาวร ห้ามลบ/แก้ไขทุกกรณี
          </div>
        </div>

        {/* KPI 4: Minigame Course */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>การจ่ายแบบฝึกหัด</span>
            <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
              <Gamepad2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-white mt-1">
            มินิเกมฟื้นฟู
          </div>
          <div className="text-[11px] text-purple-400">
            จัดตารางแบบรายเดือนหรือสุ่มรายสัปดาห์
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href="/pt/patients"
          className="p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl w-fit mb-3 group-hover:scale-105 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-base mb-1">คนไข้ในความดูแล & ฝากเคส</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ลงทะเบียนคนไข้ใหม่ รีเซ็ตรหัสผ่าน และส่งต่อเคสชั่วคราวให้ PT อื่นตามช่วงวัน
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold group-hover:translate-x-1 transition-transform">
            <span>เข้าสู่ระบบคนไข้</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>

        <Link
          href="/pt/medical-notes"
          className="p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl w-fit mb-3 group-hover:scale-105 transition-transform">
              <FilePlus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-base mb-1">เวชระเบียน (Append-Only)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ติดตามประวัติการรักษาและพัฒนาการ พร้อมบันทึกข้อสังเกตทางการแพทย์แบบต่อท้ายเสมอ
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-blue-400 font-semibold group-hover:translate-x-1 transition-transform">
            <span>ดูและเขียนเวชระเบียน</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>

        <Link
          href="/pt/schedule"
          className="p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl w-fit mb-3 group-hover:scale-105 transition-transform">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-base mb-1">จ่ายคอร์สมินิเกม</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              จัดตารางฝึกมินิเกมฟื้นฟู เลือกวันที่แบบระบุเองรายเดือน หรือสุ่มกระจายอัตโนมัติตลอดสัปดาห์
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-purple-400 font-semibold group-hover:translate-x-1 transition-transform">
            <span>จัดตารางฝึก</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      </div>

      {/* Recent Patients Table */}
      <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white text-sm">คนไข้ในความดูแลล่าสุด</h3>
          </div>
          <Link
            href="/pt/patients"
            className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>ดูคนไข้ทั้งหมด</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">คนไข้</th>
                <th className="px-4 py-3">สถานะความดูแล</th>
                <th className="px-4 py-3">การวินิจฉัย</th>
                <th className="px-4 py-3 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : recentPatients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    ยังไม่มีคนไข้ในความดูแล
                  </td>
                </tr>
              ) : (
                recentPatients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{p.full_name}</div>
                      <div className="text-[11px] text-slate-500">HN: {p.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.careType === 'primary' ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          คนไข้หลัก
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                          เคสฝากชั่วคราว
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {p.diagnosis || '— ยังไม่ระบุ —'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/pt/medical-notes?patientId=${p.id}`}
                          className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-[11px] font-medium"
                        >
                          เวชระเบียน
                        </Link>
                        <Link
                          href={`/pt/schedule?patientId=${p.id}`}
                          className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-[11px] font-medium"
                        >
                          จัดคอร์ส
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
