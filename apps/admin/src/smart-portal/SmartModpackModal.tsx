/**
 * apps/admin/src/smart-portal/SmartModpackModal.tsx
 * Custom Modpack / Preset Bundle Creation Modal
 * Conforms to Master Prompt v4 Section 5
 */

import React, { useState, useEffect } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  X,
  Layers,
  Trash2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface SmartModpackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SmartModpackModal: React.FC<SmartModpackModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [availableExercises, setAvailableExercises] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<
    Array<{ exercise_id: string; name: string; sets: number; reps: number }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function loadExercises() {
      try {
        const list = await defaultApiClient.exercises.list();
        setAvailableExercises(
          list.map((ex) => ({
            id: ex.id,
            name: ex.title,
            target_joint: ex.target_joint || '',
            target_angle: 90,
            safety_warnings: ex.warnings || '',
            demo_url: ex.image_path || '',
            default_sets: ex.default_sets || 3,
            default_reps: ex.default_reps || 10,
          }))
        );
      } catch {
        // non-blocking
      }
    }
    loadExercises();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddExercise = (exerciseId: string) => {
    const ex = availableExercises.find((x) => x.id === exerciseId);
    if (!ex) return;

    setSelectedItems((prev) => [
      ...prev,
      { exercise_id: ex.id, name: ex.name, sets: 3, reps: 10 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('กรุณาระบุชื่อชุดท่าฝึก (Modpack)');
      return;
    }
    if (selectedItems.length === 0) {
      setErrorMsg('กรุณาเลือกท่าฝึกอย่างน้อย 1 ท่า');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await defaultApiClient.modpacks.create({
        name: name.trim(),
        items: selectedItems.map((item, idx) => ({
          exercise_id: item.exercise_id,
          sets: item.sets,
          reps: item.reps,
          position: idx + 1,
        })),
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึก Modpack ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">สร้างชุดท่าฝึกกายภาพ (Modpack)</h2>
              <div className="text-xs text-slate-400">
                รวมหลายๆ ท่า (5–10+ ท่า) เพื่อนำไปใช้งานซ้ำในคลิกเดียว
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">
              ชื่อชุดท่าฝึก <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น คอร์สฟื้นฟูหลังผ่าตัดหัวเข่า ระยะที่ 1"
              required
              className="bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none"
            />
          </div>

          {/* Add Exercise Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">
              เลือกท่าฝึกเพื่อเพิ่มลงในชุดนี้
            </label>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleAddExercise(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none"
            >
              <option value="" disabled>
                + เลือกท่าฝึกกายภาพ...
              </option>
              {availableExercises.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.target_joint})
                </option>
              ))}
            </select>
          </div>

          {/* Selected Items List */}
          <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
            {selectedItems.map((item, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="font-semibold text-white truncate max-w-[200px]">
                  {idx + 1}. {item.name}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">
                    {item.sets} เซ็ต × {item.reps} ครั้ง
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1 text-slate-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition active:scale-95 shadow-md shadow-purple-950 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>บันทึก Modpack</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
