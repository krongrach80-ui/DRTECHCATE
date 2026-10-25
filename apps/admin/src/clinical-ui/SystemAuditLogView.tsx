/**
 * apps/admin/src/clinical-ui/SystemAuditLogView.tsx
 * Master Prompt v5 Section 4.7: Hospital Security Audit Logs & Device Ban Governance
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  MedicalCard,
  StatusBadge,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';

interface AuditItem {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  ip: string;
  device: string;
  action: string;
  status: 'normal' | 'suspicious' | 'blocked';
}

export const SystemAuditLogView: React.FC = () => {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [_loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categories = ['ALL', 'AUTH', 'PATIENT', 'THERAPIST', 'TREATMENT', 'SYSTEM', 'AI'];

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await defaultApiClient.audit.list();
      if (res && Array.isArray(res)) {
        const mapped: AuditItem[] = res.map((r: any) => ({
          id: r.id,
          timestamp: new Date(r.created_at).toLocaleString('th-TH'),
          user: r.actor_id || r.actor_type || 'system',
          role: r.actor_type || 'system',
          ip: r.ip || '127.0.0.1',
          device: r.device_id || 'Browser / Kiosk Client',
          action: r.action,
          status: r.action.includes('REJECT') || r.action.includes('FAIL')
            ? 'suspicious'
            : r.action.includes('BAN')
            ? 'blocked'
            : 'normal',
        }));
        setLogs(mapped);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  const handleBan = async (type: 'device' | 'ip', target: string) => {
    if (!window.confirm(`ยืนยันการแบน ${type.toUpperCase()}: ${target}?`)) return;
    try {
      setErrorMsg(null);
      await defaultApiClient.security.createBan({
        type,
        value: target,
        reason: 'ระงับสิทธิ์ความปลอดภัยจากบันทึก Audit Log',
      });
      setSuccessMsg(`สั่งแบน ${type.toUpperCase()} (${target}) ลงฐานข้อมูล Supabase สำเร็จ`);
      void fetchLogs();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถดำเนินการแบนได้');
    }
  };

  const handleResetAuth = async (user: string) => {
    try {
      setErrorMsg(null);
      await defaultApiClient.security.forceLogout(user, 'รีเซ็ตสิทธิ์จากบันทึก Audit Log');
      setSuccessMsg(`รีเซ็ตสิทธิ์และบังคับออกจากระบบของ ${user} สำเร็จ`);
      void fetchLogs();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถรีเซ็ตสิทธิ์ได้');
    }
  };

  return (
    <div className="p-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-emerald-600" />
            <span>ประวัติการใช้งานและบันทึกความปลอดภัย (Audit & Security Logs)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            บันทึกเวชสารสนเทศแบบไม่สามารถเปลี่ยนแปลงได้ (Tamper-evident Audit Trail) สอดคล้องตาม HIPAA
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchLogs()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition shadow-sm"
        >
          <span>⟲ รีเฟรชข้อมูล</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter Category Pills & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto select-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                filterCategory === cat
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหา Action, User, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <MedicalCard className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">TIMESTAMP</th>
                <th className="py-3 px-4">USER / ROLE / ID</th>
                <th className="py-3 px-4">IP ADDRESS</th>
                <th className="py-3 px-4">DEVICE / OS TYPE</th>
                <th className="py-3 px-4">ACTION PERFORMED</th>
                <th className="py-3 px-4">SECURITY STATUS</th>
                <th className="py-3 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                    {item.timestamp}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{item.user}</div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">
                      {item.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                    {item.ip}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {item.device}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-emerald-800">
                    {item.action}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge
                      variant={item.status === 'normal' ? 'active' : item.status === 'suspicious' ? 'pending' : 'danger'}
                      text={item.status === 'normal' ? 'Normal' : item.status === 'suspicious' ? 'Suspicious' : 'Blocked'}
                    />
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleResetAuth(item.user)}
                      className="py-1 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-bold transition"
                      title="รีเซ็ตสิทธิ์การเข้าใช้งาน"
                    >
                      ⟲ รีเซ็ตสิทธิ์
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBan('device', item.device)}
                      className="py-1 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition"
                      title="แบนอุปกรณ์นี้"
                    >
                      แบนเครื่อง
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBan('ip', item.ip)}
                      className="py-1 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition"
                      title="แบนหมายเลข IP นี้"
                    >
                      แบน IP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MedicalCard>
    </div>
  );
};
