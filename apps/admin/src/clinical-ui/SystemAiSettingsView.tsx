/**
 * apps/admin/src/clinical-ui/SystemAiSettingsView.tsx
 * Master Prompt v5 Section 4.7: 3 Hospital AI & Biometrics Setting Cards with Smooth Range Sliders
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  ScanFace,
  Activity,
  Volume2,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  MedicalCard,
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';

export const SystemAiSettingsView: React.FC = () => {
  // Card 1: AI Face & Biometrics
  const [cosineSimilarity, setCosineSimilarity] = useState(0.80);
  const [marginThreshold, setMarginThreshold] = useState(0.08);
  const [livenessEnabled, setLivenessEnabled] = useState(true);

  // Card 2: AI Pose & Biomechanics
  const [poseConfidence, setPoseConfidence] = useState(0.65);
  const [landmarkVisibility, setLandmarkVisibility] = useState(0.55);
  const [romTolerance, setRomTolerance] = useState(10);
  const [maxTrunkLean, setMaxTrunkLean] = useState(22);
  const [maxVelocity, setMaxVelocity] = useState(220);

  // Card 3: Audio & HIS Cloud Sync
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const [hisCloudSync, setHisCloudSync] = useState(true);

  const [_isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load active AI parameters from Supabase backend on mount
  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await defaultApiClient.security.getAiSettings();
        if (isMounted && settings) {
          setCosineSimilarity(settings.cosine_similarity ?? 0.80);
          setMarginThreshold(settings.margin_threshold ?? 0.08);
          setLivenessEnabled(settings.liveness_enabled ?? true);
          setPoseConfidence(settings.pose_confidence ?? 0.65);
          setLandmarkVisibility(settings.landmark_visibility ?? 0.55);
          setRomTolerance(settings.rom_tolerance ?? 10);
          setMaxTrunkLean(settings.max_trunk_lean ?? 22);
          setMaxVelocity(settings.max_velocity ?? 220);
          setVoiceGuidance(settings.voice_guidance ?? true);
          setHisCloudSync(settings.his_cloud_sync ?? true);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดการตั้งค่าระบบ AI ได้');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleResetDefaults = async () => {
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const reset = await defaultApiClient.security.resetAiSettings();
      setCosineSimilarity(reset.cosine_similarity);
      setMarginThreshold(reset.margin_threshold);
      setLivenessEnabled(reset.liveness_enabled);
      setPoseConfidence(reset.pose_confidence);
      setLandmarkVisibility(reset.landmark_visibility);
      setRomTolerance(reset.rom_tolerance);
      setMaxTrunkLean(reset.max_trunk_lean);
      setMaxVelocity(reset.max_velocity);
      setVoiceGuidance(reset.voice_guidance);
      setHisCloudSync(reset.his_cloud_sync);
      setSuccessMsg('รีเซ็ตค่าพารามิเตอร์ AI กลับสู่ค่ามาตรฐานทางการแพทย์เรียบร้อย');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถรีเซ็ตค่าพารามิเตอร์ AI ได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await defaultApiClient.security.updateAiSettings({
        cosine_similarity: cosineSimilarity,
        margin_threshold: marginThreshold,
        liveness_enabled: livenessEnabled,
        pose_confidence: poseConfidence,
        landmark_visibility: landmarkVisibility,
        rom_tolerance: romTolerance,
        max_trunk_lean: maxTrunkLean,
        max_velocity: maxVelocity,
        voice_guidance: voiceGuidance,
        his_cloud_sync: hisCloudSync,
      });
      setSuccessMsg('บันทึกการตั้งค่าระบบ AI และเกณฑ์ความปลอดภัยลงฐานข้อมูล Supabase สำเร็จ');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการตั้งค่าระบบ AI ได้');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-6 font-sans">
      {/* Header & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-normal flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-600" />
            <span>ตั้งค่าระบบและการประมวลผล AI (System & AI Calibration)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ปรับแต่งเกณฑ์การตัดสินใจของโมเดล ArcFace, MediaPipe Pose และการเชื่อมโยงระบบ HIS โรงพยาบาล
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>รีเซ็ตเป็นค่าเริ่มต้น</span>
          </button>

          <SmoothButton
            variant="primary"
            size="md"
            isLoading={isSaving}
            onClick={handleSaveSettings}
            icon={<Save className="w-4 h-4" />}
          >
            <span>บันทึกการตั้งค่า</span>
          </SmoothButton>
        </div>
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

      {/* 3 Clean Setting Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARD 1: AI Face Scan & Biometrics */}
        <MedicalCard className="p-6 border border-slate-200 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <ScanFace className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  1. ระบบ AI สแกนใบหน้าและชีวมิติ
                </h3>
                <span className="text-[11px] text-slate-400">ArcFace 512-D L2 Normalized</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Slider 1 */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Cosine Similarity Threshold</span>
                  <span className="font-mono text-emerald-700">{cosineSimilarity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.01"
                  value={cosineSimilarity}
                  onChange={(e) => setCosineSimilarity(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400">ค่าแนะนำ 0.80 (FAR &lt; 0.001%)</span>
              </div>

              {/* Slider 2 */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Top-1 / Top-2 Margin Threshold</span>
                  <span className="font-mono text-emerald-700">{marginThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="0.20"
                  step="0.01"
                  value={marginThreshold}
                  onChange={(e) => setMarginThreshold(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400">ป้องกันการสับสนระหว่างบุคคลแฝด</span>
              </div>

              {/* Checkbox 1 */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={livenessEnabled}
                    onChange={(e) => setLivenessEnabled(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <strong className="block text-slate-800">โหมดตรวจจับการมีชีวิต (Liveness Verification)</strong>
                    ตรวจจับการกะพริบตาและการเคลื่อนไหวเพื่อป้องกันการหลอกด้วยรูปถ่าย
                  </span>
                </label>
              </div>
            </div>
          </div>
        </MedicalCard>

        {/* CARD 2: AI Pose & Biomechanics */}
        <MedicalCard className="p-6 border border-slate-200 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  2. AI ตรวจจับท่าทาง & ชีวกลศาสตร์
                </h3>
                <span className="text-[11px] text-slate-400">MediaPipe Pose 33 Landmarks</span>
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Pose Confidence</span>
                  <span className="font-mono text-teal-700">{poseConfidence.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.40"
                  max="0.90"
                  step="0.05"
                  value={poseConfidence}
                  onChange={(e) => setPoseConfidence(parseFloat(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Landmark Visibility</span>
                  <span className="font-mono text-teal-700">{landmarkVisibility.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.30"
                  max="0.80"
                  step="0.05"
                  value={landmarkVisibility}
                  onChange={(e) => setLandmarkVisibility(parseFloat(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>ROM Tolerance (ความคลาดเคลื่อน)</span>
                  <span className="font-mono text-teal-700">{romTolerance}°</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="25"
                  step="1"
                  value={romTolerance}
                  onChange={(e) => setRomTolerance(parseInt(e.target.value, 10))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Max Trunk Lean Angle</span>
                  <span className="font-mono text-teal-700">{maxTrunkLean}°</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="35"
                  step="1"
                  value={maxTrunkLean}
                  onChange={(e) => setMaxTrunkLean(parseInt(e.target.value, 10))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Max Velocity (ความเร็วเชิงมุม)</span>
                  <span className="font-mono text-teal-700">{maxVelocity}°/s</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="350"
                  step="10"
                  value={maxVelocity}
                  onChange={(e) => setMaxVelocity(parseInt(e.target.value, 10))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </MedicalCard>

        {/* CARD 3: Audio & HIS Cloud Sync */}
        <MedicalCard className="p-6 border border-slate-200 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  3. ระบบเสียง & การซิงค์ข้อมูลแม่ข่าย
                </h3>
                <span className="text-[11px] text-slate-400">HIS / EMR Cloud Connector</span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={voiceGuidance}
                  onChange={(e) => setVoiceGuidance(e.target.checked)}
                  className="mt-1 rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Volume2 className="w-4 h-4 text-sky-600" />
                    <span>เสียงผู้ช่วย AI แนะนำท่าทางภาษาไทย</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ออกเสียงนับครั้งและแจ้งเตือนเมื่อท่าทางผิดสรีรวิทยาอัตโนมัติ
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hisCloudSync}
                  onChange={(e) => setHisCloudSync(e.target.checked)}
                  className="mt-1 rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Cloud className="w-4 h-4 text-sky-600" />
                    <span>ซิงค์เวชระเบียนโรงพยาบาลอัตโนมัติ</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ส่งสรุปผลการฟื้นฟูเข้าสู่ฐานข้อมูลกลางของโรงพยาบาลแบบเรียลไทม์
                  </p>
                </div>
              </label>
            </div>
          </div>
        </MedicalCard>
      </div>
    </div>
  );
};
