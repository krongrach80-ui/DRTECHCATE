'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, Search, Award, Calendar } from 'lucide-react';

interface PTRecord {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  pts?: {
    license_no: string;
    license_expiry: string | null;
    specialty: string | null;
  } | null;
}

export default function AdminPTsPage() {
  const [pts, setPts] = useState<PTRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadPTs() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/users?role=pt');
        const data = await res.json();
        if (res.ok && data.users) {
          setPts(data.users);
        }
      } catch {
        setPts([]);
      } finally {
        setLoading(false);
      }
    }
    loadPTs();
  }, []);

  const filtered = pts.filter(
    (p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase()) ||
      (p.pts?.license_no && p.pts.license_no.includes(search))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <UserCheck className="w-7 h-7 text-emerald-400" />
            <span>รายชื่อนักกายภาพบำบัด (PT Directory)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            ทะเบียนบุคลากรวิชาชีพกายภาพบำบัดประจำโรงพยาบาล ตรวจสอบใบอนุญาตประกอบวิชาชีพและความเชี่ยวชาญ
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, เลขที่ใบอนุญาต..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="text-xs text-slate-400">
          พบทั้งหมด <span className="text-emerald-400 font-semibold">{filtered.length}</span> ท่าน
        </div>
      </div>

      {/* Grid of PT Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs">
            <div className="inline-block w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-2" />
            <div>กำลังโหลดข้อมูลนักกายภาพบำบัด...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs glass-panel rounded-2xl">
            ยังไม่มีข้อมูลนักกายภาพบำบัดในระบบ (สามารถเพิ่มได้ในหน้า "จัดการผู้ใช้")
          </div>
        ) : (
          filtered.map((pt) => {
            const isExpired =
              pt.pts?.license_expiry && new Date(pt.pts.license_expiry) < new Date();

            return (
              <div
                key={pt.id}
                className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-base shadow-inner">
                        {pt.full_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm">{pt.full_name}</h3>
                        <div className="text-xs text-slate-400 font-mono">@{pt.username}</div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        pt.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {pt.is_active ? 'ปฏิบัติงาน' : 'ระงับงาน'}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span>ใบประกอบวิชาชีพ:</span>
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {pt.pts?.license_no || 'ไม่ระบุ'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        <span>วันหมดอายุใบอนุญาต:</span>
                      </span>
                      <span className={isExpired ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                        {pt.pts?.license_expiry ? new Date(pt.pts.license_expiry).toLocaleDateString('th-TH') : 'ไม่ระบุ'}
                        {isExpired && ' (หมดอายุ)'}
                      </span>
                    </div>

                    {pt.pts?.specialty && (
                      <div className="pt-2 border-t border-slate-800/60 text-slate-400">
                        <span className="text-slate-400 block mb-0.5">ความเชี่ยวชาญ:</span>
                        <span className="text-emerald-300 font-medium">{pt.pts.specialty}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800/60">
                  <span>{pt.phone ? `📞 ${pt.phone}` : 'ไม่มีเบอร์โทร'}</span>
                  <span className="text-[11px] text-slate-500">
                    เข้าร่วม {new Date(pt.created_at).toLocaleDateString('th-TH')}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
