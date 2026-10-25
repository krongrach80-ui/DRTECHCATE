import React, { useState, useEffect } from 'react';
import {
  Dumbbell,
  Search,
  Plus,
  Edit,
  Trash2,
  Lock,
  Upload,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import {
  ExerciseRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';
import {
  SmartExerciseLibraryModal,
  SmartModpackModal
} from '../smart-portal/index.js';

interface ExerciseCatalogViewProps {
  currentUserId: string;
}

export const ExerciseCatalogView: React.FC<ExerciseCatalogViewProps> = ({
  currentUserId,
}) => {
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [search, setSearch] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'hospital'>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSmartExerciseModalOpen, setIsSmartExerciseModalOpen] = useState(false);
  const [isSmartModpackModalOpen, setIsSmartModpackModalOpen] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseRecord | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_muscle: '',
    difficulty: 'easy' as 'easy' | 'medium' | 'hard',
    default_sets: 3,
    default_reps: 10,
    duration_seconds: 30,
  });

  const fetchExercises = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const list = await defaultApiClient.exercises.list();
      setExercises(list);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดคลังท่ากายภาพได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorMsg('กรุณากรอกชื่อท่ากายภาพ');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.create({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        target_muscle: formData.target_muscle.trim() || undefined,
        difficulty: formData.difficulty,
        default_sets: formData.default_sets,
        default_reps: formData.default_reps,
        duration_seconds: formData.duration_seconds,
      });

      setSuccessMsg(`สร้างท่ากายภาพใหม่ "${formData.title}" เรียบร้อย (ท่านเป็นผู้สร้าง)`);
      setIsCreateModalOpen(false);
      setFormData({
        title: '',
        description: '',
        target_muscle: '',
        difficulty: 'easy',
        default_sets: 3,
        default_reps: 10,
        duration_seconds: 30,
      });
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างท่ากายภาพได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEdit = (ex: ExerciseRecord) => {
    if (ex.created_by && ex.created_by !== currentUserId) {
      setErrorMsg('ท่านสามารถแก้ไขได้เฉพาะท่ากายภาพที่ท่านสร้างขึ้นเองเท่านั้น');
      return;
    }
    setEditingExercise(ex);
    setFormData({
      title: ex.title,
      description: ex.description || '',
      target_muscle: ex.target_muscle || '',
      difficulty: (ex.difficulty as 'easy' | 'medium' | 'hard') || 'easy',
      default_sets: ex.default_sets || 3,
      default_reps: ex.default_reps || 10,
      duration_seconds: ex.duration_seconds || 30,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExercise) return;

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.update(editingExercise.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        target_muscle: formData.target_muscle.trim() || undefined,
        difficulty: formData.difficulty,
        default_sets: formData.default_sets,
        default_reps: formData.default_reps,
        duration_seconds: formData.duration_seconds,
      });

      setSuccessMsg(`อัปเดตท่ากายภาพ "${formData.title}" สำเร็จ`);
      setIsEditModalOpen(false);
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตท่ากายภาพได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExercise = async (ex: ExerciseRecord) => {
    if (ex.created_by && ex.created_by !== currentUserId) {
      setErrorMsg('ท่านสามารถลบได้เฉพาะท่ากายภาพที่ท่านสร้างขึ้นเองเท่านั้น (DB Trigger Enforced)');
      return;
    }
    if (!window.confirm(`ยืนยันการลบท่า "${ex.title}"?`)) return;

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.delete(ex.id);
      setSuccessMsg(`ลบท่า "${ex.title}" เรียบร้อย`);
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบท่ากายภาพได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadMedia = async (ex: ExerciseRecord, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (ex.created_by && ex.created_by !== currentUserId) {
      setErrorMsg('ไม่อนุญาตให้อัปโหลดสื่อทับท่าที่ผู้อื่นสร้าง');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.uploadMedia(ex.id, file);
      setSuccessMsg(`อัปโหลดสื่อสำหรับท่า "${ex.title}" เรียบร้อย`);
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอัปโหลดสื่อ');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch =
      ex.title.toLowerCase().includes(search.toLowerCase()) ||
      (ex.target_muscle && ex.target_muscle.toLowerCase().includes(search.toLowerCase()));

    const isMine = ex.created_by === currentUserId;
    if (ownershipFilter === 'mine') return matchesSearch && isMine;
    if (ownershipFilter === 'hospital') return matchesSearch && !isMine;
    return matchesSearch;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-teal-400" />
            <span>คลังท่ากายภาพบำบัด (Exercise Catalog)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            ดูท่าทั้งหมดในคลัง เพิ่มท่าใหม่ และจัดการเฉพาะท่าที่ท่านสร้างขึ้นเอง (Database Trigger Enforced)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchExercises}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            title="รีเฟรช"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsSmartExerciseModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-950/40"
          >
            <Sparkles className="w-4 h-4" />
            <span>Smart Upload (v4)</span>
          </button>
          <button
            onClick={() => setIsSmartModpackModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-950/40"
          >
            <Sparkles className="w-4 h-4" />
            <span>Smart Modpack (v4)</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm shadow-lg shadow-teal-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างท่ากายภาพใหม่</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อท่า, กล้ามเนื้อเป้าหมาย..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setOwnershipFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              ownershipFilter === 'all'
                ? 'bg-teal-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ทั้งหมด ({exercises.length})
          </button>
          <button
            onClick={() => setOwnershipFilter('mine')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              ownershipFilter === 'mine'
                ? 'bg-teal-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ท่าที่ฉันสร้าง
          </button>
          <button
            onClick={() => setOwnershipFilter('hospital')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              ownershipFilter === 'hospital'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            คลังส่วนกลาง
          </button>
        </div>
      </div>

      {/* Exercises Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500">
            กำลังโหลดรายการท่ากายภาพ...
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500">
            ไม่พบท่ากายภาพในหมวดนี้
          </div>
        ) : (
          filteredExercises.map((ex) => {
            const isMine = ex.created_by === currentUserId;
            return (
              <div
                key={ex.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 space-y-4 shadow-lg transition flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-white text-base leading-snug">{ex.title}</h4>
                    {isMine ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>ท่าของฉัน</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>ส่วนกลาง</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">
                    {ex.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <span className="px-2 py-0.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-800">
                      🎯 {ex.target_muscle || 'กล้ามเนื้อรวม'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                        ex.difficulty === 'hard'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : ex.difficulty === 'medium'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {ex.difficulty === 'hard' ? 'ยาก' : ex.difficulty === 'medium' ? 'ปานกลาง' : 'ง่าย'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-950 font-mono text-teal-400 border border-slate-800">
                      {ex.default_sets} เซ็ต × {ex.default_reps} ครั้ง
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    ระยะเวลา ~{ex.duration_seconds || 30} วิ
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Media Upload (Only mine) */}
                    {isMine && (
                      <label
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-slate-800 cursor-pointer transition"
                        title="อัปโหลดรูปภาพ/วิดีโอประกอบ"
                      >
                        <Upload className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*,video/*"
                          onChange={(e) => handleUploadMedia(ex, e)}
                          className="hidden"
                        />
                      </label>
                    )}

                    {/* Edit Button (Only mine) */}
                    {isMine ? (
                      <button
                        onClick={() => handleOpenEdit(ex)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        title="แก้ไขท่ากายภาพนี้"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="p-1.5 text-slate-600" title="ท่าส่วนกลาง แก้ไขไม่ได้">
                        <Lock className="w-4 h-4" />
                      </span>
                    )}

                    {/* Delete Button (Only mine) */}
                    {isMine && (
                      <button
                        onClick={() => handleDeleteExercise(ex)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                        title="ลบท่านี้"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Create Exercise */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-400" />
                <span>สร้างท่ากายภาพใหม่</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อท่ากายภาพ</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="เช่น Quad Sets, Wall Squat, Straight Leg Raise"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">กล้ามเนื้อเป้าหมาย</label>
                <input
                  type="text"
                  value={formData.target_muscle}
                  onChange={(e) => setFormData({ ...formData, target_muscle: e.target.value })}
                  placeholder="เช่น Quadriceps, Hamstrings, Core, กล้ามเนื้อสะโพก"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ความยาก</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="easy">ง่าย (Easy)</option>
                    <option value="medium">ปานกลาง (Medium)</option>
                    <option value="hard">ยาก (Hard)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">เซ็ตเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.default_sets}
                    onChange={(e) => setFormData({ ...formData, default_sets: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ครั้งเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.default_reps}
                    onChange={(e) => setFormData({ ...formData, default_reps: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">คำแนะนำ / ข้อควรระวัง</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="ระบุข้อควรระวัง เช่น อย่าเกร็งคอ, หายใจออกขณะออกแรง..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังสร้าง...' : 'สร้างท่า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Exercise */}
      {isEditModalOpen && editingExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-teal-400" />
                <span>แก้ไขท่ากายภาพ</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อท่ากายภาพ</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">กล้ามเนื้อเป้าหมาย</label>
                <input
                  type="text"
                  value={formData.target_muscle}
                  onChange={(e) => setFormData({ ...formData, target_muscle: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ความยาก</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="easy">ง่าย (Easy)</option>
                    <option value="medium">ปานกลาง (Medium)</option>
                    <option value="hard">ยาก (Hard)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">เซ็ตเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.default_sets}
                    onChange={(e) => setFormData({ ...formData, default_sets: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ครั้งเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.default_reps}
                    onChange={(e) => setFormData({ ...formData, default_reps: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">คำแนะนำ / ข้อควรระวัง</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Master Prompt v4: Smart Exercise Media Upload Modal */}
      <SmartExerciseLibraryModal
        isOpen={isSmartExerciseModalOpen}
        onClose={() => setIsSmartExerciseModalOpen(false)}
        onSuccess={() => {
          setIsSmartExerciseModalOpen(false);
          fetchExercises();
        }}
      />

      {/* Master Prompt v4: Smart Modpack Preset Builder Modal */}
      <SmartModpackModal
        isOpen={isSmartModpackModalOpen}
        onClose={() => setIsSmartModpackModalOpen(false)}
        onSuccess={() => {
          setIsSmartModpackModalOpen(false);
          fetchExercises();
        }}
      />
    </div>
  );
};
