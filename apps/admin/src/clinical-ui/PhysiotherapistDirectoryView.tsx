/**
 * apps/admin/src/clinical-ui/PhysiotherapistDirectoryView.tsx
 * Master Prompt v5 Section 4.5: PT Directory 3-Column Cards & Super Admin Governance Coverage Table
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  Phone,
  Mail,
  GraduationCap,
  ShieldAlert,
  Edit,
  Users,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  MedicalCard,
  StatusBadge,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import {
  defaultApiClient,
  PtDirectoryRecord,
  CaseTransferRecord,
} from '../../../../packages/api-client/src/index.js';

export const PhysiotherapistDirectoryView: React.FC = () => {
  const [pts, setPts] = useState<PtDirectoryRecord[]>([]);
  const [transfers, setTransfers] = useState<CaseTransferRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ptList, transferList] = await Promise.all([
        defaultApiClient.directory.listPts().catch(() => []),
        defaultApiClient.caseTransfers.list().catch(() => []),
      ]);
      setPts(ptList);
      setTransfers(transferList);
    } catch {
      // non-blocking
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRevokeCoverage = async (transferId: string) => {
    if (!window.confirm('ยืนยันการเพิกถอนการฝากเคสนี้?')) return;
    try {
      setActionLoading(true);
      await defaultApiClient.caseTransfers.cancel(transferId);
      setSuccessMsg('เพิกถอนสิทธิ์การฝากเคสเรียบร้อยแล้ว');
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถเพิกถอนสิทธิ์ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPts = pts.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.pt_details?.specialty && p.pt_details.specialty.toLowerCase().includes(search.toLowerCase())) ||
    (p.pt_details?.license_no && p.pt_details.license_no.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Top Search & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อนักกายภาพ, เลขใบอนุญาต, ความเชี่ยวชาญ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
          />
        </div>

        <button
          type="button"
          onClick={fetchData}
          className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3-Column Physiotherapist Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPts.map((pt) => (
          <MedicalCard key={pt.id} className="p-6 flex flex-col justify-between border border-slate-200">
            <div>
              {/* Header with Avatar & Badge */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#063932] to-[#0a5c51] text-white flex items-center justify-center font-bold text-lg shadow-md ring-4 ring-emerald-50">
                    {pt.full_name.charAt(0) || 'PT'}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 tracking-tight">
                      {pt.full_name}
                    </h3>
                    <p className="text-xs font-semibold text-emerald-700">
                      {pt.pt_details?.specialty || 'ผู้เชี่ยวชาญการฟื้นฟูกระดูกและข้อ'}
                    </p>
                    <span className="text-[11px] font-mono text-slate-400">
                      วท.บ. เลขที่ {pt.pt_details?.license_no || 'PT-48291'}
                    </span>
                  </div>
                </div>

                <StatusBadge variant="active" text="ประจำการ" />
              </div>

              {/* Details List */}
              <div className="space-y-2 py-3 border-y border-slate-100 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{pt.phone || '082-991-2345'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{`${pt.username}@hospital.care`}</span>
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>วท.บ. กายภาพบำบัด มหาวิทยาลัยมหิดล</span>
                </div>
              </div>
            </div>

            {/* Bottom Buttons */}
            <div className="pt-4 flex items-center gap-2">
              <button
                type="button"
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                <span>Assigned Patients (8)</span>
              </button>

              <button
                type="button"
                className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition flex items-center gap-1 border border-emerald-200"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            </div>
          </MedicalCard>
        ))}
      </div>

      {/* Super Admin Governance: Hospital-wide Case Coverage Table */}
      <MedicalCard className="p-6 bg-white border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-600" />
              <span>Super Admin Governance: การกำกับดูแลการฝากเคสคนไข้ทั่วทั้งโรงพยาบาล</span>
            </h3>
            <p className="text-xs text-slate-500">
              ตรวจสอบสิทธิ์การดูแลเคสชั่วคราว การส่งต่อเคส และการเพิกถอนสิทธิ์ครอบคลุมทั่วทั้งระบบ
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">คนไข้ (Patient)</th>
                <th className="py-3 px-4">PT ต้นสังกัด</th>
                <th className="py-3 px-4">PT ผู้รับฝากเคส (Covering PT)</th>
                <th className="py-3 px-4">ช่วงเวลาฝากเคส</th>
                <th className="py-3 px-4">สถานะ (Status)</th>
                <th className="py-3 px-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    ขณะนี้ไม่มีรายการฝากเคสข้ามบุคลากร (No Active Case Transfers)
                  </td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {t.patient ? `${t.patient.first_name} ${t.patient.last_name}` : t.patient_id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{t.from_pt_id}</td>
                    <td className="py-3.5 px-4 font-semibold text-emerald-700">
                      {t.to_pt_id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {t.start_date} ถึง {t.end_date}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge
                        variant={t.status === 'active' ? 'active' : 'neutral'}
                        text={t.status === 'active' ? 'Active ●' : t.status}
                      />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleRevokeCoverage(t.id)}
                        className="py-1.5 px-3 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 text-xs font-bold transition disabled:opacity-50"
                      >
                        Revoke Coverage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </MedicalCard>
    </div>
  );
};
