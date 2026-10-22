'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  Dumbbell,
  Calendar,
  Lock,
  Shield,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    patientsCount: 0,
    ptsCount: 0,
    exercisesCount: 0,
    bannedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [usersRes, exRes, banRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/admin/exercises'),
          fetch('/api/admin/security/banned-ips'),
        ]);

        const [usersData, exData, banData] = await Promise.all([
          usersRes.json(),
          exRes.json(),
          banRes.json(),
        ]);

        const usersList: { role: string }[] = usersData.users || [];
        setStats({
          patientsCount: usersList.filter((u) => u.role === 'patient').length,
          ptsCount: usersList.filter((u) => u.role === 'pt').length,
          exercisesCount: (exData.exercises || []).length,
          bannedCount: (banData.banned_ips || []).length,
        });
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome Hero Banner */}
      <div className="p-8 rounded-3xl glass-panel relative overflow-hidden border border-slate-800">
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 mb-4">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span>Hospital Super Admin System — แผนกกายภาพบำบัด</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            ศูนย์ควบคุมระบบกายภาพบำบัดและชีวมาตร
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            ระบบบริหารจัดการความปลอดภัย ข้อมูลคนไข้ ทะเบียนนักกายภาพบำบัด คอร์สฝึก และการตรวจสอบสิทธิ์แบบชีวมาตร (Biometric) ตามมาตรฐาน PDPA และ RLS
          </p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">คนไข้ในระบบ</div>
            <div className="text-2xl font-bold text-white">{loading ? '...' : stats.patientsCount}</div>
            <div className="text-[11px] text-indigo-400 mt-1">ทะเบียนคนไข้</div>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">นักกายภาพบำบัด</div>
            <div className="text-2xl font-bold text-white">{loading ? '...' : stats.ptsCount}</div>
            <div className="text-[11px] text-emerald-400 mt-1">บุคลากรประจำการ</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">ท่าฝึก & มินิเกม</div>
            <div className="text-2xl font-bold text-white">{loading ? '...' : stats.exercisesCount}</div>
            <div className="text-[11px] text-sky-400 mt-1">พร้อมจ่ายในคอร์ส</div>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Dumbbell className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">IP ที่ถูกระงับ</div>
            <div className="text-2xl font-bold text-white">{loading ? '...' : stats.bannedCount}</div>
            <div className="text-[11px] text-rose-400 mt-1">Banned via Middleware</div>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Lock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          href="/admin/users"
          className="glass-panel rounded-2xl p-6 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-900/50 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl w-fit mb-4 group-hover:scale-105 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="font-bold text-white text-base mb-1">จัดการผู้ใช้งาน & สแกนใบหน้า</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              สร้างผู้ใช้ใหม่ด้วย Wizard 2 ขั้นตอน พร้อมลงทะเบียนใบหน้า 10 เฟรม (iPhone Face ID UX), บังคับออกจากระบบ (Force Logout) และลบชีวมาตรตามสิทธิ PDPA
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าสู่โมดูลผู้ใช้</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link
          href="/admin/exercises"
          className="glass-panel rounded-2xl p-6 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-900/50 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl w-fit mb-4 group-hover:scale-105 transition-transform">
              <Dumbbell className="w-6 h-6" />
            </div>
            <h2 className="font-bold text-white text-base mb-1">คลังท่าฝึก & มินิเกม</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              จัดการรายการท่ากายภาพบำบัดและมินิเกมฟื้นฟูสมรรถภาพ CRUD ครบถ้วน แยกหมวดหมู่บริเวณร่างกาย และจัดการไฟล์สื่อการสอน
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าสู่คลังแบบฝึกหัด</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link
          href="/admin/schedule"
          className="glass-panel rounded-2xl p-6 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-900/50 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl w-fit mb-4 group-hover:scale-105 transition-transform">
              <Calendar className="w-6 h-6" />
            </div>
            <h2 className="font-bold text-white text-base mb-1">ตารางนัด & จัดคอร์สฝึก</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              ตั้งค่าคอร์สการฝึก 2 แท็บที่ State แยกขาดจากกัน: รายเดือน (จิ้มเลือกวันทีละวัน) หรือ รายอาทิตย์ (สุ่มอัตโนมัติและบันทึกถาวรลง course_items)
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าสู่การจัดคอร์ส</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </div>

      {/* Security Status Box */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">การรักษาความปลอดภัยระดับองค์กร (Production-grade Security)</div>
            <div className="text-xs text-slate-400 mt-0.5">
              เปิดใช้งาน RLS ครบทุกตาราง, pgvector 128 มิติ, Append-only Medical Notes, Insert-only Audit Logs
            </div>
          </div>
        </div>

        <Link
          href="/admin/security"
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all shrink-0"
        >
          ตรวจสอบ Audit Logs
        </Link>
      </div>
    </div>
  );
}
