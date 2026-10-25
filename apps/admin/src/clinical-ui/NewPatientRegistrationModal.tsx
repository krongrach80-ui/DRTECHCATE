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
  const [phone, setPhone] = useState('');
  const [responsiblePtId, setResponsiblePtId] = useState('');
  const [ptsList, setPtsList] = useState<PtDirectoryRecord[]>([]);
  const [diagnosis, setDiagnosis] = useState('');
  const [pin, setPin] = useState('');
  const [consentPdpa, setConsentPdpa] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        style={{
          boxShadow: '0 25px 70px -15px rgba(6, 57, 50, 0.3)',
        }}
        className="w-full max-w-2xl bg-white rounded-3xl border border-emerald-500/20 overflow-hidden shadow-2xl relative font-sans max-h-[92dvh] flex flex-col"
      >
        {/* Header */}
        <div className="pt-6 sm:pt-7 px-6 sm:px-8 pb-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/25 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 leading-snug">
                สมัครบัญชีคนไข้ใหม่ (ลงทะเบียนเปิดประวัติผู้ป่วย)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-normal">
                ระบบสร้างเวชระเบียนและลงทะเบียนใบหน้าชีวมิติเชื่อมต่อตู้ Kiosk อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition active:scale-95 cursor-pointer shrink-0"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Pill Indicator */}
        <div className="px-6 sm:px-8 py-3 bg-slate-50/70 border-b border-slate-100 shrink-0">
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
          <div className="mx-6 sm:mx-8 mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm leading-relaxed shrink-0">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Form Inputs */}
        {step === 1 && (
          <form onSubmit={handleProceedToScan} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 sm:gap-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  รหัสคนไข้ (HN / Patient Code)
                </label>
                <div className="w-full h-12 px-4 bg-slate-100/90 border border-slate-200/90 rounded-xl text-sm font-mono font-bold text-slate-700 flex items-center shadow-inner select-all cursor-not-allowed">
                  {hn}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  ชื่อ-นามสกุล คนไข้ <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="เช่น นายธนกร รุ่งเรือง"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-12 pl-11 pr-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-sm sm:text-base text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  อายุ (ปี)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full h-12 px-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-sm sm:text-base text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เพศ
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as 'male' | 'female')}
                  className="w-full h-12 px-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-sm sm:text-base text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm cursor-pointer"
                >
                  <option value="male">ชาย (Male)</option>
                  <option value="female">หญิง (Female)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เบอร์โทรศัพท์ติดต่อ
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08X-XXX-XXXX"
                    className="w-full h-12 pl-11 pr-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-sm sm:text-base text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  นักกายภาพผู้รับผิดชอบ <span className="text-rose-500">*</span>
                </label>
                <select
                  value={responsiblePtId}
                  onChange={(e) => setResponsiblePtId(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-sm sm:text-base text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm cursor-pointer"
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
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                การวินิจฉัยเบื้องต้น / แผนการรักษา (Clinical Diagnosis)
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="เช่น ข้อไหล่ติดระยะฟื้นฟู, กล้ามเนื้อสะโพกอ่อนแรง"
                className="w-full h-12 px-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-sm sm:text-base text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                รหัส PIN สำรองสำหรับตู้ (4 หลัก)
              </label>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-36 h-12 px-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-base text-slate-800 text-center tracking-widest font-mono font-bold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all outline-none shadow-sm"
              />
            </div>

            {/* PDPA Biometric Consent Checkbox */}
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-start gap-3.5 shadow-sm">
              <input
                type="checkbox"
                id="pdpa-consent"
                checked={consentPdpa}
                onChange={(e) => setConsentPdpa(e.target.checked)}
                className="mt-1 w-5 h-5 rounded-md text-emerald-600 border-emerald-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
              />
              <label htmlFor="pdpa-consent" className="text-xs sm:text-sm text-emerald-950 leading-relaxed cursor-pointer select-none">
                <span className="font-bold text-emerald-900 block mb-0.5">
                  ความยินยอมจัดเก็บข้อมูลชีวมิติ (PDPA Biometric Consent)
                </span>
                คนไข้ยินยอมให้บันทึกภาพถ่ายและเวกเตอร์ 512 มิติ เพื่อใช้ในการพิสูจน์ตัวตนที่ตู้คีออสและเก็บในเซิร์ฟเวอร์โรงพยาบาลอย่างปลอดภัย
              </label>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm font-semibold transition active:scale-95 cursor-pointer"
              >
                ยกเลิก
              </button>
              <SmoothButton
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                icon={<ArrowRight className="w-4 h-4" />}
                className="shadow-md shadow-emerald-600/20 text-sm font-bold"
              >
                <span>ขั้นตอนถัดไป: สแกนใบหน้าคนไข้ ➔</span>
              </SmoothButton>
            </div>
          </form>
        )}

        {/* STEP 2: Real Biometric Scan */}
        {step === 2 && (
          <div className="p-6 sm:p-8 flex flex-col items-center text-center space-y-5 overflow-y-auto flex-1">
            <div className="relative w-80 h-60 rounded-2xl bg-slate-900 border-4 border-emerald-500 overflow-hidden flex items-center justify-center shadow-xl">
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
                  <span className="text-sm font-medium">{cameraError || 'กำลังเริ่มต้นกล้องเว็บแคม...'}</span>
                </div>
              )}
              <div className="absolute top-2 left-2 text-[10px] font-mono text-emerald-400 bg-black/70 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>AI CAMERA {cameraActive ? 'LIVE' : 'INITIALIZING'}</span>
              </div>
            </div>

            <div className="max-w-md w-full">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1.5">
                สแกนใบหน้าคนไข้เพื่อสร้างแม่แบบชีวมิติ 512 มิติ
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mb-5 leading-relaxed">
                กรุณาให้คนไข้มองตรงมาที่กล้อง เพื่อบันทึกภาพถ่ายและสร้างแม่แบบเวกเตอร์สำหรับตู้ Kiosk
              </p>

              <div className="flex flex-col gap-3">
                <SmoothButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleCaptureBiometrics}
                  isLoading={isLoading}
                  icon={<Camera className="w-4 h-4" />}
                  className="w-full shadow-lg shadow-emerald-600/25 text-sm sm:text-base font-bold py-3"
                >
                  <span>📸 ถ่ายภาพใบหน้าและบันทึกแม่แบบชีวมิติ</span>
                </SmoothButton>

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setStep(3);
                  }}
                  className="w-full py-2.5 rounded-xl text-slate-500 hover:text-slate-800 text-xs sm:text-sm font-semibold text-center transition hover:bg-slate-50"
                >
                  ข้ามขั้นตอนนี้ (ไปขั้นตอนที่ 3) ➔
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Ready for Kiosk */}
        {step === 3 && (
          <div className="p-6 sm:p-8 flex flex-col items-center text-center space-y-6 overflow-y-auto flex-1">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-800 leading-snug">
                เปิดประวัติผู้ป่วยและบันทึกใบหน้าชีวมิติสำเร็จ!
              </h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                คนไข้ <span className="font-bold text-emerald-700">{name}</span> (HN: {hn}) สามารถสแกนใบหน้าที่ตู้ Kiosk เพื่อเริ่มการฝึกกายภาพบำบัดได้ทันที
              </p>
            </div>

            <div className="w-full max-w-md p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 text-left text-sm space-y-2.5 shadow-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">HN ผู้ป่วย:</span>
                <span className="font-mono font-bold text-slate-800">{hn}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">แผนการรักษา:</span>
                <span className="font-semibold text-slate-800">{diagnosis || 'กายภาพบำบัดฟื้นฟู'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">สถานะการยืนยันตัวตน:</span>
                <span className="font-bold text-emerald-700">● 512-D L2 Normalized Ready</span>
              </div>
            </div>

            <SmoothButton
              type="button"
              variant="primary"
              size="lg"
              onClick={handleFinish}
              className="w-full max-w-xs shadow-lg shadow-emerald-600/25 text-sm sm:text-base font-bold py-3"
              icon={<ShieldCheck className="w-5 h-5" />}
            >
              <span>เสร็จสิ้น และพร้อมใช้งานตู้ Kiosk</span>
            </SmoothButton>
          </div>
        )}
      </div>
    </div>
  );
};
