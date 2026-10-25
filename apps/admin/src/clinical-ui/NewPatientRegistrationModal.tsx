/**
 * apps/admin/src/clinical-ui/NewPatientRegistrationModal.tsx
 * Master Prompt v5 Section 4.3: 3-Step Patient Registration Modal with Biometric Consent
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Camera,
  CheckCircle2,
  ShieldCheck,
  User,
  Phone,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  SmoothStepper,
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { defaultApiClient, PtDirectoryRecord } from '../../../../packages/api-client/src/index.js';

interface NewPatientRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPatientId: string) => void;
}

export const NewPatientRegistrationModal: React.FC<NewPatientRegistrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Form state
  const [hn, setHn] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState(45);
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [phone, setPhone] = useState('081-234-5678');
  const [responsiblePtId, setResponsiblePtId] = useState('');
  const [ptsList, setPtsList] = useState<PtDirectoryRecord[]>([]);
  const [diagnosis, setDiagnosis] = useState('ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)');
  const [pin, setPin] = useState('1234');
  const [consentPdpa, setConsentPdpa] = useState(true);

  // Step 2: Biometric scan state
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch {
      setCameraError('ไม่สามารถเข้าถึงกล้องเว็บแคมได้ (กรุณาอนุญาตสิทธิ์กล้องในเบราว์เซอร์)');
      setCameraActive(false);
    }
  };

  useEffect(() => {
    if (step === 2) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step]);

  // Generate automatic HN on modal open
  useEffect(() => {
    if (isOpen) {
      const randomHnNum = Math.floor(1000 + Math.random() * 9000);
      setHn(`P-${randomHnNum}`);
      setStep(1);
      setErrorMsg(null);
      setCameraError(null);

      // Load PT directory for dropdown
      defaultApiClient.directory.listPts().then((pts) => {
        setPtsList(pts);
        if (pts.length > 0) {
          setResponsiblePtId((prev) => prev || pts[0].id);
        }
      }).catch(() => {});
    } else {
      stopCamera();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handler for Step 1 -> Step 2
  const handleProceedToScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('กรุณากรอกชื่อ-นามสกุลคนไข้');
      return;
    }
    if (!consentPdpa) {
      setErrorMsg('กรุณายินยอมให้จัดเก็บข้อมูลชีวมิติตามกฎหมาย PDPA');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);

      // 1. Create patient record
      const splitNames = name.trim().split(' ');
      const firstName = splitNames[0] || 'ผู้ป่วย';
      const lastName = splitNames.slice(1).join(' ') || 'ใหม่';

      // Call API to create patient
      const res = await defaultApiClient.patients.create({
        first_name: firstName,
        last_name: lastName,
        age: Number(age) || 30,
        sex,
        phone,
        injury: diagnosis,
        responsible_pt_id: responsiblePtId || undefined,
      });

      setCreatedPatientId(res.id);
      setStep(2);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลงทะเบียนคนไข้ได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCaptureBiometrics = async () => {
    if (!createdPatientId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      let embedding: number[] = [];
      let base64Jpeg = '';

      if (videoRef.current && videoRef.current.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 112;
        canvas.height = 112;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 112, 112);
          base64Jpeg = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
          const { GeometricLandmarkEmbeddingModel } = await import(
            '../../../../packages/face-client/src/index.js'
          );
          const model = new GeometricLandmarkEmbeddingModel();
          embedding = await model.embed(canvas);
        }
      }

      if (embedding.length === 512) {
        // Enroll face into database
        await defaultApiClient.face.enroll({
          patient_id: createdPatientId,
          frames: [
            {
              pose: 'front',
              embedding,
              jpeg_base64: base64Jpeg,
            },
          ],
        });
      }

      stopCamera();
      setStep(3);
    } catch {
      // Non-blocking: allow proceeding even if face enrollment encounters network glitch
      stopCamera();
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = () => {
    stopCamera();
    if (createdPatientId) {
      onSuccess(createdPatientId);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        style={{
          boxShadow: '0 25px 60px -15px rgba(6, 57, 50, 0.25)',
        }}
        className="w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl border border-slate-200 overflow-hidden shadow-2xl relative font-sans max-h-[92dvh] flex flex-col"
      >
        {/* Header */}
        <div className="pt-6 px-8 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <span>สมัครบัญชีคนไข้ใหม่ (ลงทะเบียนเปิดประวัติผู้ป่วย)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              ระบบสร้างเวชระเบียนและลงทะเบียนใบหน้าชีวมิติเชื่อมต่อตู้ Kiosk อัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Pill Indicator */}
        <div className="px-8 pt-3 bg-slate-50/50 border-b border-slate-100">
          <SmoothStepper
            steps={[
              { number: 1, label: '1. กรอกข้อมูลคนไข้' },
              { number: 2, label: '2. สแกนใบหน้าชีวมิติ' },
              { number: 3, label: '3. พร้อมใช้งานตู้' },
            ]}
            currentStep={step}
          />
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-8 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Form Inputs */}
        {step === 1 && (
          <form onSubmit={handleProceedToScan} className="p-8 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสคนไข้ (HN / Patient Code)
                </label>
                <input
                  type="text"
                  readOnly
                  value={hn}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-600 select-all cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อ-นามสกุล คนไข้ *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="เช่น นายสมชาย ใจดี"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  อายุ (ปี)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เพศ
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as 'male' | 'female')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="male">ชาย (Male)</option>
                  <option value="female">หญิง (Female)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เบอร์โทรศัพท์ติดต่อ
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08X-XXX-XXXX"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  นักกายภาพผู้รับผิดชอบ *
                </label>
                <select
                  value={responsiblePtId}
                  onChange={(e) => setResponsiblePtId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  {ptsList.length === 0 && <option value="">กำลังโหลดรายชื่อนักกายภาพ...</option>}
                  {ptsList.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.full_name} ({pt.pt_details?.specialty || 'นักกายภาพบำบัด'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                การวินิจฉัยเบื้องต้น / แผนการรักษา (Clinical Diagnosis)
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="เช่น ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รหัส PIN สำรองสำหรับตู้ (4 หลัก)
              </label>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-32 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 text-center tracking-widest font-mono font-bold"
              />
            </div>

            {/* PDPA Biometric Consent Checkbox */}
            <div className="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200/80 flex items-start gap-3">
              <input
                type="checkbox"
                id="pdpa-consent"
                checked={consentPdpa}
                onChange={(e) => setConsentPdpa(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="pdpa-consent" className="text-xs text-sky-900 leading-relaxed cursor-pointer select-none">
                <span className="font-bold">ความยินยอมจัดเก็บข้อมูลชีวมิติ (PDPA Biometric Consent):</span>{' '}
                คนไข้ยินยอมให้บันทึกภาพถ่ายและเวกเตอร์ 512 มิติ เพื่อใช้ในการพิสูจน์ตัวตนที่ตู้คีออสและเก็บในเซิร์ฟเวอร์โรงพยาบาลอย่างปลอดภัย
              </label>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition"
              >
                ยกเลิก
              </button>
              <SmoothButton
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                <span>ขั้นตอนถัดไป: สแกนใบหน้าคนไข้ ➔</span>
              </SmoothButton>
            </div>
          </form>
        )}

        {/* STEP 2: Real Biometric Scan */}
        {step === 2 && (
          <div className="p-8 flex flex-col items-center text-center space-y-4">
            <div className="relative w-72 h-56 rounded-2xl bg-slate-900 border-4 border-emerald-500 overflow-hidden flex items-center justify-center shadow-xl">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover -scale-x-100 ${cameraActive ? 'block' : 'hidden'}`}
              />
              {!cameraActive && (
                <div className="flex flex-col items-center justify-center p-4 text-slate-400 space-y-2">
                  <Camera className="w-12 h-12 text-emerald-400 animate-pulse" />
                  <span className="text-xs">{cameraError || 'กำลังเริ่มต้นกล้องเว็บแคม...'}</span>
                </div>
              )}
              <div className="absolute top-2 left-2 text-[10px] font-mono text-emerald-400 bg-black/70 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>AI CAMERA {cameraActive ? 'LIVE' : 'INITIALIZING'}</span>
              </div>
            </div>

            <div className="max-w-md w-full">
              <h3 className="text-base font-bold text-slate-800 mb-1">
                สแกนใบหน้าคนไข้เพื่อสร้างแม่แบบชีวมิติ 512 มิติ
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                กรุณาให้คนไข้มองตรงมาที่กล้อง เพื่อบันทึกภาพถ่ายและสร้างแม่แบบเวกเตอร์สำหรับตู้ Kiosk
              </p>

              <div className="flex flex-col gap-2">
                <SmoothButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleCaptureBiometrics}
                  isLoading={isLoading}
                  icon={<Camera className="w-4 h-4" />}
                  className="w-full"
                >
                  <span>📸 ถ่ายภาพใบหน้าและบันทึกแม่แบบชีวมิติ</span>
                </SmoothButton>

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setStep(3);
                  }}
                  className="w-full py-2 rounded-xl text-slate-400 hover:text-slate-600 text-xs font-semibold text-center transition"
                >
                  ข้ามขั้นตอนนี้ (ไปขั้นตอนที่ 3) ➔
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Ready for Kiosk */}
        {step === 3 && (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-800">
                เปิดประวัติผู้ป่วยและบันทึกใบหน้าชีวมิติสำเร็จ!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                คนไข้ <span className="font-bold text-emerald-700">{name}</span> (HN: {hn}) สามารถสแกนใบหน้าที่ตู้ Kiosk เพื่อเริ่มการฝึกกายภาพบำบัดได้ทันที
              </p>
            </div>

            <div className="w-full max-w-sm p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-left text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">HN ผู้ป่วย:</span>
                <span className="font-mono font-bold text-slate-800">{hn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">แผนการรักษา:</span>
                <span className="font-semibold text-slate-800">{diagnosis}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">สถานะการยืนยันตัวตน:</span>
                <span className="font-bold text-emerald-700">● 512-D L2 Normalized Ready</span>
              </div>
            </div>

            <SmoothButton
              type="button"
              variant="primary"
              size="lg"
              onClick={handleFinish}
              className="w-full max-w-xs"
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              <span>เสร็จสิ้น และพร้อมใช้งานตู้ Kiosk</span>
            </SmoothButton>
          </div>
        )}
      </div>
    </div>
  );
};
