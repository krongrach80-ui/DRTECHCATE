/**
 * apps/admin/src/clinical-ui/MiniGameQuestionsView.tsx
 * Master Prompt v5 Section 4.6: Category Filter Pills & 3-Column Question Cards
 */

import React, { useState } from 'react';
import {
  Gamepad2,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  MedicalCard,
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';

interface QuestionItem {
  id: string;
  category: string;
  icon: string;
  prompt: string;
  correctAnswer: 'yes' | 'no';
  explanation: string;
}

export const MiniGameQuestionsView: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด');
  const [search, setSearch] = useState('');

  const categories = [
    'ทั้งหมด',
    '🍎 อาหาร & ผลไม้',
    '🥄 สิ่งของเครื่องใช้',
    '🐶 สัตว์',
    '🔢 การนับจำนวน',
    '🏠 ชีวิตประจำวัน',
    '😊 สีและรูปทรง',
    '🧭 ทิศทาง & ตำแหน่ง',
  ];

  // Default Clinical Cognitive Rehabilitation Questions
  const [questions, setQuestions] = useState<QuestionItem[]>([
    {
      id: 'q-1',
      category: '🍎 อาหาร & ผลไม้',
      icon: '🍌',
      prompt: 'กล้วยเป็นผลไม้ที่มีรสหวานและให้พลังงานโพแทสเซียมสูง ใช่หรือไม่?',
      correctAnswer: 'yes',
      explanation: 'ใช่ กล้วยอุดมด้วยโพแทสเซียมช่วยเสริมสร้างการทำงานของกล้ามเนื้อ',
    },
    {
      id: 'q-2',
      category: '🥄 สิ่งของเครื่องใช้',
      icon: '🥣',
      prompt: 'ช้อนส้อมใช้สำหรับรับประทานอาหาร ใช่หรือไม่?',
      correctAnswer: 'yes',
      explanation: 'ใช่ เป็นอุปกรณ์พื้นฐานในการรับประทานอาหาร',
    },
    {
      id: 'q-3',
      category: '🐶 สัตว์',
      icon: '🐱',
      prompt: 'แมวสามารถว่ายน้ำและหายใจในน้ำได้เหมือนปลา ใช่หรือไม่?',
      correctAnswer: 'no',
      explanation: 'ไม่ใช่ แมวเป็นสัตว์เลี้ยงลูกด้วยนมที่หายใจด้วยปอด',
    },
    {
      id: 'q-4',
      category: '🔢 การนับจำนวน',
      icon: '🖐️',
      prompt: 'มือข้างหนึ่งของมนุษย์มีทั้งหมด 5 นิ้ว ใช่หรือไม่?',
      correctAnswer: 'yes',
      explanation: 'ใช่ มนุษย์มี 5 นิ้วในแต่ละข้าง (โป้ง, ชี้, กลาง, นาง, ก้อย)',
    },
    {
      id: 'q-5',
      category: '🏠 ชีวิตประจำวัน',
      icon: '🪥',
      prompt: 'แปรงสีฟันใช้สำหรับหวีผมให้เรียบ ใช่หรือไม่?',
      correctAnswer: 'no',
      explanation: 'ไม่ใช่ แปรงสีฟันใช้สำหรับทำความสะอาดช่องปาก',
    },
    {
      id: 'q-6',
      category: '😊 สีและรูปทรง',
      icon: '🔴',
      prompt: 'ผลสตรอว์เบอร์รีสุกตามธรรมชาติมีสีแดง ใช่หรือไม่?',
      correctAnswer: 'yes',
      explanation: 'ใช่ สตรอว์เบอร์รีสุกจะมีสีแดงสด',
    },
  ]);

  const filteredQuestions = questions.filter((q) => {
    const matchesCategory =
      selectedCategory === 'ทั้งหมด' || q.category.includes(selectedCategory.replace(/[^ก-๙a-zA-Z]/g, '').trim());
    const matchesSearch =
      q.prompt.toLowerCase().includes(search.toLowerCase()) ||
      q.explanation.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDelete = (id: string) => {
    if (window.confirm('ยืนยันการลบโจทย์คำถามนี้?')) {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    }
  };

  return (
    <div className="p-8 space-y-6 font-sans">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-emerald-600" />
            <span>คลังโจทย์คำถามมินิเกมฝึกสมอง (Cognitive Rehab Questions)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            โจทย์สำหรับกระตุ้นสมองและชะลอภาวะสมองเสื่อม ตอบผ่านการพยักหน้า/ส่ายหน้า หรือแตะหน้าจอสัมผัส
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาโจทย์ หรือคำอธิบาย..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
            />
          </div>

          <SmoothButton
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => alert('เปิดหน้าต่างเพิ่มโจทย์มินิเกมใหม่')}
          >
            <span>+ เพิ่มโจทย์ใหม่</span>
          </SmoothButton>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 select-none">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ${
              selectedCategory === cat
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/20 scale-[1.02]'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 3-Column Question Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredQuestions.map((q) => (
          <MedicalCard key={q.id} className="p-6 flex flex-col justify-between border border-slate-200">
            <div>
              {/* Category & Icon */}
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                  {q.category}
                </span>
                <span className="text-2xl">{q.icon}</span>
              </div>

              {/* Bold Prompt */}
              <h3 className="text-sm font-black text-slate-800 leading-snug mb-3">
                "{q.prompt}"
              </h3>

              {/* Answer Badge */}
              <div className="mb-3">
                {q.correctAnswer === 'yes' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>✓ ใช่ (พยักหน้า / แตะขวา)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>✕ ไม่ใช่ (ส่ายหน้า / แตะซ้าย)</span>
                  </span>
                )}
              </div>

              {/* Explanation */}
              <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-700">คำอธิบาย:</span> {q.explanation}
              </p>
            </div>

            {/* Edit / Delete Buttons */}
            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                className="py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>✎ แก้ไข</span>
              </button>

              <button
                type="button"
                onClick={() => handleDelete(q.id)}
                className="py-1.5 px-3 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>🗑 ลบ</span>
              </button>
            </div>
          </MedicalCard>
        ))}
      </div>
    </div>
  );
};
