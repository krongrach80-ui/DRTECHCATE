'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dumbbell,
  Gamepad2,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  Trash2,
  Power,
  Film,
} from 'lucide-react';
import { Exercise, ExerciseType } from '@/types/database';

const BODY_AREAS = [
  'คอ / บ่า / ไหล่',
  'หลังส่วนล่าง & แกนกลางลำตัว',
  'แขน / ข้อมือ',
  'สะโพก / เข่า / ข้อเท้า',
  'การทรงตัวและการเดิน',
  'ทั่วไป / ยืดเหยียด',
];

export default function AdminExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | ExerciseType>('all');
  const [selectedBodyArea, setSelectedBodyArea] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'exercise' as ExerciseType,
    title: '',
    body_area: BODY_AREAS[0],
    description: '',
    media_path: '',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exercises?type=${typeFilter}&body_area=${encodeURIComponent(selectedBodyArea)}`);
      const data = await res.json();
      if (res.ok && data.exercises) {
        setExercises(data.exercises);
      } else {
        setExercises([]);
      }
    } catch {
      setExercises([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, selectedBodyArea]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      type: 'exercise',
      title: '',
      body_area: BODY_AREAS[0],
      description: '',
      media_path: '',
      is_active: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (ex: Exercise) => {
    setEditingId(ex.id);
    setFormData({
      type: ex.type,
      title: ex.title,
      body_area: ex.body_area,
      description: ex.description || '',
      media_path: ex.media_path || '',
      is_active: ex.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('กรุณากรอกชื่อท่าหรือมินิเกม');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const url = editingId ? `/api/admin/exercises/${editingId}` : '/api/admin/exercises';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      }

      setNotification({
        type: 'success',
        message: `${editingId ? 'แก้ไข' : 'เพิ่ม'} รายการ "${formData.title}" เรียบร้อยแล้ว`,
      });
      setIsModalOpen(false);
      fetchExercises();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (ex: Exercise) => {
    try {
      const res = await fetch(`/api/admin/exercises/${ex.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !ex.is_active }),
      });
      if (res.ok) {
        setNotification({
          type: 'success',
          message: `${ex.is_active ? 'ปิด' : 'เปิด'} การใช้งานท่า "${ex.title}" เรียบร้อยแล้ว`,
        });
        fetchExercises();
      }
    } catch {
      setNotification({ type: 'error', message: 'ไม่สามารถเปลี่ยนสถานะได้' });
    }
  };

  const handleDelete = async (ex: Exercise) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ "${ex.title}"?`)) return;

    try {
      const res = await fetch(`/api/admin/exercises/${ex.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ลบไม่สำเร็จ');
      }
      setNotification({ type: 'success', message: `ลบ "${ex.title}" สำเร็จ` });
      fetchExercises();
    } catch (err: unknown) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const filtered = exercises.filter((ex) =>
    ex.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ex.description && ex.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Dumbbell className="w-7 h-7 text-sky-400" />
            <span>คลังท่าฝึก & มินิเกม (Exercise & Minigame Library)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            CRUD ท่ากายภาพบำบัดและมินิเกมฟื้นฟูสมรรถภาพ พร้อมจัดหมวดหมู่และสื่อการสอน
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-semibold rounded-xl glow-btn transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>เพิ่มท่าฝึก / มินิเกมใหม่</span>
        </button>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
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
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อท่า, รายละเอียด..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Type Filter */}
          <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                typeFilter === 'all' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('exercise')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                typeFilter === 'exercise' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>ท่ากายภาพ</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('minigame')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                typeFilter === 'minigame' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>มินิเกม</span>
            </button>
          </div>

          {/* Body Area Select */}
          <select
            value={selectedBodyArea}
            onChange={(e) => setSelectedBodyArea(e.target.value)}
            className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">ทุกบริเวณร่างกาย</option>
            {BODY_AREAS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Exercise Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs">
            <div className="inline-block w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-2" />
            <div>กำลังโหลดคลังแบบฝึกหัด...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs glass-panel rounded-2xl">
            ไม่พบรายการท่าฝึกหรือมินิเกมตามเงื่อนไขที่เลือก
          </div>
        ) : (
          filtered.map((ex) => (
            <div
              key={ex.id}
              className={`glass-panel rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                ex.is_active ? 'border-slate-800 hover:border-slate-700' : 'border-rose-950/40 opacity-70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                      ex.type === 'minigame'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                    }`}
                  >
                    {ex.type === 'minigame' ? <Gamepad2 className="w-3 h-3" /> : <Dumbbell className="w-3 h-3" />}
                    <span>{ex.type === 'minigame' ? 'มินิเกม' : 'ท่ากายภาพ'}</span>
                  </span>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      ex.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {ex.is_active ? 'พร้อมใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>

                <h3 className="font-bold text-white text-base mb-1.5">{ex.title}</h3>
                <div className="text-xs text-sky-300 font-medium mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>{ex.body_area}</span>
                </div>

                {ex.description && (
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-4">
                    {ex.description}
                  </p>
                )}

                {ex.media_path && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-xl mb-4 border border-slate-800/60">
                    <Film className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">{ex.media_path}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => handleToggleActive(ex)}
                  className={`text-xs flex items-center gap-1.5 font-medium cursor-pointer ${
                    ex.is_active ? 'text-slate-400 hover:text-rose-400' : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{ex.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(ex)}
                    className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="แก้ไขข้อมูล"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ex)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    title="ลบรายการ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Exercise Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-sky-400" />
                <span>{editingId ? 'แก้ไขท่าฝึก / มินิเกม' : 'เพิ่มท่าฝึก / มินิเกมใหม่'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  ประเภทหมวดหมู่
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'exercise' })}
                    className={`py-3 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      formData.type === 'exercise'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Dumbbell className="w-4 h-4" />
                    <span>ท่ากายภาพบำบัด</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'minigame' })}
                    className={`py-3 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      formData.type === 'minigame'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Gamepad2 className="w-4 h-4" />
                    <span>มินิเกม (Mini-game)</span>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs text-slate-300 mb-1">ชื่อท่าฝึก หรือ มินิเกม *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="เช่น ท่ายืดกล้ามเนื้อสะบัก (Scapular Retraction)"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Body Area */}
              <div>
                <label className="block text-xs text-slate-300 mb-1">บริเวณร่างกายที่เน้น (Body Area) *</label>
                <select
                  value={formData.body_area}
                  onChange={(e) => setFormData({ ...formData, body_area: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {BODY_AREAS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-slate-300 mb-1">คำอธิบายวิธีการปฏิบัติ / กติกา</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="อธิบายขั้นตอนการทำท่า จำนวนครั้ง หรือคำแนะนำเพื่อความปลอดภัย..."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Media Path */}
              <div>
                <label className="block text-xs text-slate-300 mb-1">เส้นทางสื่อสาธิต (Media Path ใน Storage)</label>
                <input
                  type="text"
                  value={formData.media_path}
                  onChange={(e) => setFormData({ ...formData, media_path: e.target.value })}
                  placeholder="เช่น exercise-media/scapular_demo.mp4"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 glow-btn transition-all cursor-pointer flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>บันทึกข้อมูล</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
