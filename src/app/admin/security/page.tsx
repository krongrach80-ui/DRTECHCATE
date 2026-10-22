'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Ban,
  Activity,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Globe,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AuditLogRecord {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles?: {
    full_name: string;
    username: string;
    role: string;
  } | null;
}

interface BannedIpRecord {
  ip: string;
  reason: string | null;
  banned_by: string | null;
  created_at: string;
  expires_at: string | null;
}

export default function AdminSecurityPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [bannedIps, setBannedIps] = useState<BannedIpRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingBans, setLoadingBans] = useState(true);

  const [searchLog, setSearchLog] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Ban IP Modal
  const [isBanModalOpen, setIsBanModalOpen] = useState(false);
  const [banForm, setBanForm] = useState({
    ip: '',
    reason: '',
    expires_at: '',
  });
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Realtime indicator
  const [isLive, setIsLive] = useState(false);

  // 1. Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/security/audit-logs?action=${actionFilter}&limit=100`);
      const data = await res.json();
      if (res.ok && data.logs) {
        setLogs(data.logs);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingLogs(false);
    }
  }, [actionFilter]);

  // 2. Fetch Banned IPs
  const fetchBannedIps = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/security/banned-ips');
      const data = await res.json();
      if (res.ok && data.banned_ips) {
        setBannedIps(data.banned_ips);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingBans(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditLogs();
    fetchBannedIps();
  }, [fetchAuditLogs, fetchBannedIps]);

  // 3. Supabase Realtime Subscription for audit_logs
  useEffect(() => {
    try {
      const supabase = createClient();
      const channel = supabase
        .channel('realtime_audit_logs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'audit_logs' },
          (payload) => {
            const newLog = payload.new as AuditLogRecord;
            setLogs((prev) => [newLog, ...prev]);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setIsLive(true);
          }
        });

      // Polling fallback every 10s if realtime disconnects
      const interval = setInterval(() => {
        fetchAuditLogs();
      }, 10000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    } catch {
      // Offline fallback
    }
  }, [fetchAuditLogs]);

  // Handle Ban IP Submit
  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banForm.ip.trim() || !banForm.reason.trim()) {
      setNotification({ type: 'error', message: 'กรุณากรอก IP Address และเหตุผล' });
      return;
    }

    setBanSubmitting(true);
    try {
      const res = await fetch('/api/admin/security/banned-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(banForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แบน IP ไม่สำเร็จ');

      setNotification({ type: 'success', message: `แบน IP ${banForm.ip} เรียบร้อยแล้ว (Middleware จะสกัดกั้นทันที)` });
      setIsBanModalOpen(false);
      setBanForm({ ip: '', reason: '', expires_at: '' });
      fetchBannedIps();
    } catch (err: unknown) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBanSubmitting(false);
    }
  };

  // Handle Unban IP
  const handleUnban = async (ip: string) => {
    if (!confirm(`คุณต้องการปลดแบน IP ${ip} หรือไม่?`)) return;

    try {
      const res = await fetch(`/api/admin/security/banned-ips/${encodeURIComponent(ip)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ปลดแบนไม่สำเร็จ');

      setNotification({ type: 'success', message: `ปลดแบน IP ${ip} สำเร็จ` });
      fetchBannedIps();
    } catch (err: unknown) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(searchLog.toLowerCase()) ||
      (l.ip && l.ip.includes(searchLog)) ||
      (l.profiles?.username && l.profiles.username.toLowerCase().includes(searchLog.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Lock className="w-7 h-7 text-amber-400" />
            <span>ความปลอดภัย & บันทึกการตรวจสอบ (Security & Audit Logs)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Realtime Audit Logs (Insert-only บันทึกถาวรห้ามแก้ไข), การแบน IP ที่บังคับใช้ใน Middleware และจัดการความปลอดภัย
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsBanModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 shadow-lg shadow-rose-600/20"
        >
          <Ban className="w-4 h-4" />
          <span>แบน IP Address (Banned IP)</span>
        </button>
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

      {/* Top Section: Active Banned IPs List */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-rose-400" />
            <h2 className="font-bold text-white text-sm">
              รายการ IP ที่ถูกระงับการเข้าถึง (Banned IPs) — บังคับใช้ใน Middleware
            </h2>
          </div>
          <span className="text-xs text-rose-300 font-semibold bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
            {bannedIps.length} รายการ
          </span>
        </div>

        {loadingBans ? (
          <div className="py-6 text-center text-xs text-slate-500">กำลังโหลดรายการ Banned IPs...</div>
        ) : bannedIps.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
            ไม่มี IP ใดถูกแบนในขณะนี้
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bannedIps.map((b) => (
              <div
                key={b.ip}
                className="p-3.5 bg-slate-950/60 border border-rose-950/60 rounded-xl flex items-start justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-mono font-bold text-rose-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-rose-400" />
                    <span>{b.ip}</span>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-1">{b.reason || 'ละเมิดนโยบายความปลอดภัย'}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    แบนเมื่อ: {new Date(b.created_at).toLocaleString('th-TH')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnban(b.ip)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  ปลดแบน
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Section: Realtime Audit Logs */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
        {/* Table Header Controls */}
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-sky-400" />
            <h2 className="font-bold text-white text-sm">บันทึกกิจกรรมระบบ (Audit Trail)</h2>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Realtime Connected</span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchLog}
                onChange={(e) => setSearchLog(e.target.value)}
                placeholder="ค้นหา Action, IP, ผู้ใช้..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <button
              type="button"
              onClick={fetchAuditLogs}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-3 font-semibold">เวลา</th>
                <th className="px-4 py-3 font-semibold">กิจกรรม (Action)</th>
                <th className="px-4 py-3 font-semibold">ผู้ดำเนินการ (Actor)</th>
                <th className="px-4 py-3 font-semibold">เป้าหมาย (Entity)</th>
                <th className="px-4 py-3 font-semibold">IP Address</th>
                <th className="px-5 py-3 font-semibold">รายละเอียด (Metadata)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {loadingLogs ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500 font-sans">
                    <div className="inline-block w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-2" />
                    <div>กำลังโหลดบันทึกการตรวจสอบ...</div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500 font-sans">
                    ไม่มีรายการกิจกรรมที่ตรงตามเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isFailure =
                    log.action.includes('FAIL') ||
                    log.action.includes('BLOCK') ||
                    log.action.includes('BAN');

                  return (
                    <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isFailure
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-sans">
                        {log.profiles ? (
                          <span>
                            {log.profiles.full_name} (@{log.profiles.username})
                          </span>
                        ) : (
                          <span className="text-slate-500">System / Anonymous</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {log.entity}
                        {log.entity_id && (
                          <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">
                            {log.entity_id}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{log.ip || '-'}</td>
                      <td className="px-5 py-3 text-slate-400 max-w-xs truncate" title={JSON.stringify(log.metadata)}>
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ban IP Modal */}
      {isBanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-400" />
                <span>แบน IP Address (Enforce via Middleware)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsBanModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBanSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-semibold">IP Address *</label>
                <input
                  type="text"
                  required
                  value={banForm.ip}
                  onChange={(e) => setBanForm({ ...banForm, ip: e.target.value })}
                  placeholder="เช่น 192.168.1.100 หรือ 203.0.113.1"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1 font-semibold">เหตุผลในการระงับ *</label>
                <textarea
                  rows={3}
                  required
                  value={banForm.reason}
                  onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })}
                  placeholder="เช่น พยายาม Brute Force รหัสผ่านผิดซ้ำซ้อนเกิน 20 ครั้ง"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1 font-semibold">
                  วันหมดอายุการแบน (เว้นว่างไว้หากต้องการแบนถาวร)
                </label>
                <input
                  type="datetime-local"
                  value={banForm.expires_at}
                  onChange={(e) => setBanForm({ ...banForm, expires_at: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBanModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={banSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-all cursor-pointer flex items-center gap-2"
                >
                  {banSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการแบน IP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
