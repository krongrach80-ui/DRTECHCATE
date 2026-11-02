/**
 * apps/kiosk/src/smart-flow/SmartLoginView.tsx
 * Centered Smart Kiosk Card Design matching 100% reference design
 * 3-Second Countdown & 250ms Median Aggregator Verification
 * Trilingual (TH/EN/CN), Calibration Mode HUD, Touchless Gesture & PIN Backup
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';
import {
  FaceDetector,
  averageAndNormalize,
  cosineSimilarity,
  FastLoginLivenessVerifier,
  LivenessTelemetryBadge,
  LivenessVerificationResult,
  checkFaceROIInCircle,
  SpatialIdentityAnchor,
} from '../../../../packages/face-client/src/index.js';
import { useRaiseBothHandsConfirm } from '../hooks/useRaiseBothHandsConfirm';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  defaultApiClient,
} from '../../../../packages/api-client/src/index.js';
import { getFaceClientServices, preloadFaceModels } from '../services/faceClientService';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Shield,
  Info,
  X,
  KeyRound,
  RotateCw,
  FlipHorizontal,
  Camera,
  Activity,
  PhoneCall,
} from 'lucide-react';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';

interface SmartLoginViewProps {
  onLoginSuccess: (patient: PatientRecordFile) => void;
  onNavigateToEnroll: () => void;
  customDetector?: FaceDetector;
  onOpenStaffLoginModal?: () => void;
  onOpenNewPatientModal?: () => void;
  isPaused?: boolean;
}

interface BiometricSample {
  vector: number[];
  score: number; // cosine similarity [0.0 - 1.0]
  percent: number; // similarity % [0 - 100]
  distance: number;
  candidateId?: string;
  candidateName?: string;
  candidateHn?: string;
  secondCandidate?: { name: string; hn: string; score: number };
  liveness: LivenessVerificationResult;
  timestamp: number;
}

interface CachedPatientBiometric {
  id: string;
  hn: string;
  name: string;
  vectors: number[][];
}

export const SmartLoginView: React.FC<SmartLoginViewProps> = ({
  onLoginSuccess,
  onNavigateToEnroll,
  customDetector,
  onOpenStaffLoginModal,
  onOpenNewPatientModal,
  isPaused = false,
}) => {
  const { t, lang } = useClinicalI18n();
  const [presenceDetected, setPresenceDetected] = useState<boolean>(false);
  const [faceInCircle, setFaceInCircle] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น');
  const [unrecognizedAlert, setUnrecognizedAlert] = useState<string | null>(null);
  const [matchedPatient, setMatchedPatient] = useState<PatientRecordFile | null>(null);
  const [identityAnchor, setIdentityAnchor] = useState<SpatialIdentityAnchor | null>(null);
  const [similarityInfo, setSimilarityInfo] = useState<{ percent: number; distance: number } | null>(null);
  const [livenessResult, setLivenessResult] = useState<LivenessVerificationResult | null>(null);
  const [cameraRotation, setCameraRotation] = useState<0 | 90 | 180 | 270>(0);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [userDisabledCamera, setUserDisabledCamera] = useState<boolean>(false);

  // 3-Second Countdown & Realtime Aggregator states
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [realtimeScore, setRealtimeScore] = useState<number | null>(null);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const q = window.location.search;
      return q.includes('calibration=true') || q.includes('debug=1');
    }
    return false;
  });
  const [calibrationStats, setCalibrationStats] = useState<{
    currentCos: number;
    currentDist: number;
    currentPercent: number;
    medianPercent: number;
    minPercent: number;
    maxPercent: number;
    samplesCount: number;
    depthScore: number;
    ear: number;
    top1?: { name: string; hn: string; score: number };
    top2?: { name: string; hn: string; score: number };
  } | null>(null);

  // Rate Limiting (5 failures/minute -> 30s cooldown)
  const [rateLimitCooldownSec, setRateLimitCooldownSec] = useState<number>(0);
  const failedScanTimestampsRef = useRef<number[]>([]);

  // Periodic Sampling Refs
  const sampleFramesRef = useRef<BiometricSample[]>([]);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownStartTimeRef = useRef<number>(0);
  const isCountingDownRef = useRef<boolean>(false);
  const cachedPatientsRef = useRef<CachedPatientBiometric[]>([]);

  const fastLivenessVerifierRef = useRef<FastLoginLivenessVerifier>(new FastLoginLivenessVerifier(350));
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastProbeVectorRef = useRef<number[] | null>(null);
  const scanFailureCountRef = useRef<number>(0);
  const consecutiveSteadyFramesRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);

  // Modals inside Kiosk Screen
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  // Effective pause state
  const isScanningPaused = Boolean(isPaused || isAboutModalOpen || isPinModalOpen || userDisabledCamera);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Touchless "Raise-Both-Hands" Readiness Confirmation Hook (Reuses active video stream)
  const {
    progress: gestureProgress,
    status: gestureStatus,
    thaiMessage: gestureMessage,
    showAccessibilityFallbackHint,
    handleManualConfirm,
    resetConfirmation,
  } = useRaiseBothHandsConfirm({
    videoRef,
    isOpen: Boolean(matchedPatient),
    anchor: identityAnchor,
    onConfirm: () => {
      if (matchedPatient) {
        onLoginSuccess(matchedPatient);
      }
    },
  });

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const cameraRotationRef = useRef(cameraRotation);
  const isMirroredRef = useRef(isMirrored);

  useEffect(() => {
    cameraRotationRef.current = cameraRotation;
    isMirroredRef.current = isMirrored;
  }, [cameraRotation, isMirrored]);

  const customDetectorRef = useRef(customDetector);
  useEffect(() => {
    customDetectorRef.current = customDetector;
  }, [customDetector]);

  const isCameraStartingRef = useRef<boolean>(false);
  const isCameraStartedRef = useRef<boolean>(false);

  // Rate limit cooldown countdown timer
  useEffect(() => {
    if (rateLimitCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCooldownSec]);

  // Load Enrolled Patients for instant local cosine evaluation (<0.1ms per frame)
  const loadEnrolledPatients = useCallback(async () => {
    try {
      const items: CachedPatientBiometric[] = [];

      // 1. From localStorage 'drtech_resilient_patients'
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('drtech_resilient_patients');
        if (raw) {
          try {
            const list = JSON.parse(raw);
            for (const p of list) {
              const vecs: number[][] = [];
              if (p.biometrics?.face_vector && p.biometrics.face_vector.length === 512) {
                vecs.push(p.biometrics.face_vector);
              }
              if (p.history?.face_vector && p.history.face_vector.length === 512) {
                vecs.push(p.history.face_vector);
              }
              if (p.history?.frontal_centroid && p.history.frontal_centroid.length === 512) {
                vecs.push(p.history.frontal_centroid);
              }
              if (Array.isArray(p.frames)) {
                for (const f of p.frames) {
                  if (f.embedding && f.embedding.length === 512) vecs.push(f.embedding);
                }
              }
              if (Array.isArray(p.history?.frames)) {
                for (const f of p.history.frames) {
                  if (f.embedding && f.embedding.length === 512) vecs.push(f.embedding);
                }
              }
              if (vecs.length > 0) {
                items.push({
                  id: p.id || p.patient_id,
                  hn: p.hn || '',
                  name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'ผู้ป่วย',
                  vectors: vecs,
                });
              }
            }
          } catch {}
        }
      }

      // 2. Fetch from Supabase Cloud REST
      try {
        const supaRes = await fetch(
          `${DEFAULT_SUPABASE_URL}/rest/v1/patients?select=id,hn,first_name,last_name,history&registration_status=neq.archived&limit=100`,
          {
            headers: {
              apikey: DEFAULT_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${DEFAULT_SUPABASE_ANON_KEY}`,
            },
          }
        );
        if (supaRes.ok) {
          const cloudPatients = await supaRes.json();
          for (const p of cloudPatients) {
            const vecs: number[][] = [];
            const h = p.history || {};
            if (h.face_vector && h.face_vector.length === 512) vecs.push(h.face_vector);
            if (h.frontal_centroid && h.frontal_centroid.length === 512) vecs.push(h.frontal_centroid);
            if (Array.isArray(h.frames)) {
              for (const f of h.frames) {
                if (f.embedding && f.embedding.length === 512) vecs.push(f.embedding);
              }
            }
            if (Array.isArray(h.adaptive_templates)) {
              for (const at of h.adaptive_templates) {
                if (at && at.length === 512) vecs.push(at);
              }
            }
            if (vecs.length > 0) {
              const existingIdx = items.findIndex((it) => it.id === p.id || it.hn === p.hn);
              const item: CachedPatientBiometric = {
                id: p.id,
                hn: p.hn || '',
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'ผู้ป่วย',
                vectors: vecs,
              };
              if (existingIdx >= 0) {
                items[existingIdx] = item;
              } else {
                items.push(item);
              }
            }
          }
        }
      } catch {
        // non-blocking cloud sync
      }

      cachedPatientsRef.current = items;
    } catch {
      // safe
    }
  }, []);

  useEffect(() => {
    loadEnrolledPatients();
    const handleRefresh = () => {
      loadEnrolledPatients();
    };
    window.addEventListener('patient-created', handleRefresh);
    window.addEventListener('staff-updated', handleRefresh);
    return () => {
      window.removeEventListener('patient-created', handleRefresh);
      window.removeEventListener('staff-updated', handleRefresh);
    };
  }, [loadEnrolledPatients]);

  // Completely Stop & Release Camera hardware and timers (Mount/Unmount lifecycle only)
  const stopCamera = useCallback(() => {
    try {
      const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
      services.camera.stop();
    } catch {}
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        } catch {}
        videoRef.current.srcObject = null;
      }
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    isCountingDownRef.current = false;
    setCountdownValue(null);
    setRealtimeScore(null);
    consecutiveSteadyFramesRef.current = 0;
    isCameraStartedRef.current = false;
    setCameraReady(false);
    setPresenceDetected(false);
  }, []);

  // Request & Initialize Camera
  const startCamera = useCallback(async () => {
    if (isCameraStartingRef.current || isCameraStartedRef.current) return;
    isCameraStartingRef.current = true;
    try {
      const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
      const { camera } = services;

      if (videoRef.current) {
        await camera.start(videoRef.current);
        isCameraStartedRef.current = true;
        if (isMountedRef.current) {
          setCameraReady(true);
        }
      }
    } catch (camErr) {
      console.warn('Camera start error:', camErr);
      if (isMountedRef.current) {
        setCameraReady(false);
      }
    } finally {
      isCameraStartingRef.current = false;
    }
  }, []);

  // Cancel running countdown immediately if face leaves or liveness fails
  const cancelCountdown = useCallback((reason?: string) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    isCountingDownRef.current = false;
    setCountdownValue(null);
    setRealtimeScore(null);
    sampleFramesRef.current = [];
    countdownStartTimeRef.current = 0;
    if (reason) {
      setStatusText(reason);
    }
  }, []);

  // Complete 3-Second Countdown: Compute Median & Verify Server-Side
  const finishCountdownAndVerify = useCallback(async () => {
    if (isProcessingScanRef.current || !isMountedRef.current || isScanningPaused) return;
    isProcessingScanRef.current = true;
    setIsScanning(true);
    setStatusText(
      lang === 'zh-CN'
        ? '正在计算中位数并验证身份...'
        : lang === 'en-US'
        ? 'Computing median & verifying identity...'
        : 'กำลังประมวลผลค่ามัธยฐานและตรวจสอบสิทธิ์...'
    );

    try {
      const samples = sampleFramesRef.current.slice();
      if (samples.length < 4) {
        setStatusText(
          lang === 'zh-CN'
            ? '人脸稳定性不足，请保持稳定'
            : lang === 'en-US'
            ? 'Face motion detected, please stay still'
            : 'การตรวจจับใบหน้ายังไม่นิ่งพอ กรุณาวางใบหน้านิ่งๆ ตรงกลางกรอบ'
        );
        isProcessingScanRef.current = false;
        setIsScanning(false);
        return;
      }

      // 1. Group samples by candidate
      const candCounts: Record<string, { cand: CachedPatientBiometric; samples: BiometricSample[] }> = {};
      for (const s of samples) {
        if (s.candidateId) {
          if (!candCounts[s.candidateId]) {
            const foundCand = cachedPatientsRef.current.find((c) => c.id === s.candidateId);
            if (foundCand) {
              candCounts[s.candidateId] = { cand: foundCand, samples: [] };
            }
          }
          if (candCounts[s.candidateId]) {
            candCounts[s.candidateId].samples.push(s);
          }
        }
      }

      const grouped = Object.values(candCounts).sort((a, b) => b.samples.length - a.samples.length);
      const topGroup = grouped[0];
      const secondGroup = grouped[1];

      // Calculate Agreement Ratio
      const totalSamples = samples.length;
      const agreementRatio = topGroup ? topGroup.samples.length / totalSamples : 0;
      const MIN_FRAME_AGREEMENT = 0.70; // Approved requirement >= 70%

      // 2. Compute Median Score
      let medianScore = 0;
      let medianPercent = 0;
      let medianDistance = 2.0;
      const topCand = topGroup?.cand || null;

      if (topGroup && topGroup.samples.length > 0) {
        const sortedScores = topGroup.samples.map((s) => s.score).sort((a, b) => a - b);
        medianScore = sortedScores[Math.floor(sortedScores.length / 2)];
        medianPercent = Math.max(0, Math.min(100, Math.round(medianScore * 100)));
        medianDistance = Math.sqrt(Math.max(0, 2 - 2 * medianScore));
      } else {
        const allScores = samples.map((s) => s.score).sort((a, b) => a - b);
        medianScore = allScores[Math.floor(allScores.length / 2)] || 0;
        medianPercent = Math.max(0, Math.min(100, Math.round(medianScore * 100)));
        medianDistance = Math.sqrt(Math.max(0, 2 - 2 * medianScore));
      }

      // Candidate 2 score & Margin check
      let secondCandScore = 0;
      if (secondGroup && secondGroup.samples.length > 0) {
        const secondSorted = secondGroup.samples.map((s) => s.score).sort((a, b) => a - b);
        secondCandScore = secondSorted[Math.floor(secondSorted.length / 2)];
      }
      const margin = medianScore - secondCandScore;
      const isMarginAmbiguous = topGroup && secondGroup && margin < 0.05; // Differ by < 5%

      // Non-blocking log to Supabase face_scan_logs
      defaultApiClient.request('/face_scan_logs', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: topCand?.id || null,
          hn: topCand?.hn || null,
          cosine_similarity: medianScore,
          euclidean_distance: medianDistance,
          similarity_percentage: medianPercent,
          samples_count: totalSamples,
          agreement_ratio: agreementRatio,
          margin,
          passed: medianPercent >= 80 && agreementRatio >= MIN_FRAME_AGREEMENT && !isMarginAmbiguous,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});

      // Snapshot capture for verification payload
      let snapshotBase64: string | undefined;
      if (videoRef.current) {
        try {
          const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
          const raw = services.camera.captureRotatedFrame(videoRef.current);
          snapshotBase64 = raw.toDataURL('image/jpeg', 0.80);
        } catch {}
      }

      // 3. Ambiguity Gate (50% - 79% OR Margin < 5% OR Frame Agreement < 70%)
      if (
        (medianPercent >= 50 && medianPercent < 80) ||
        isMarginAmbiguous ||
        (topCand && agreementRatio < MIN_FRAME_AGREEMENT && medianPercent >= 60)
      ) {
        scanFailureCountRef.current++;
        isProcessingScanRef.current = false;
        setIsScanning(false);
        const candName = topCand ? `คุณ ${topCand.name}` : '';
        const msg = lang === 'zh-CN'
          ? `匹配度 ${medianPercent}%（边界待确认）。为确保医疗安全，请使用4位PIN码验证 ${candName}`
          : lang === 'en-US'
          ? `Similarity ${medianPercent}% (Ambiguous). For clinical safety, please verify with 4-digit PIN ${candName}`
          : `ความแม่นยำ ${medianPercent}% (ก้ำกึ่ง) เพื่อความปลอดภัย กรุณายืนยันตัวตนด้วยรหัส PIN 4 หลัก ${candName}`;
        setStatusText(msg);
        setUnrecognizedAlert(msg);
        setIsPinModalOpen(true);
        return;
      }

      // 4. Decision: High Match (>= 80% with >= 70% Agreement)
      if (medianPercent >= 80 && agreementRatio >= MIN_FRAME_AGREEMENT && topCand) {
        const candidateVectors = topGroup.samples.map((s) => s.vector);
        const finalProbe = averageAndNormalize(candidateVectors);
        lastProbeVectorRef.current = finalProbe.slice();

        // Server-Side Verification call
        const res = await defaultApiClient.smartOnboarding
          .scanLogin({
            probe: finalProbe,
            snapshot: snapshotBase64,
          })
          .catch(() => null);

        finalProbe.fill(0);

        if (!isMountedRef.current || isScanningPaused) return;

        if (res && res.matched && (res as any).patient && (res.similarityPercentage ?? 0) >= 80) {
          scanFailureCountRef.current = 0;
          isProcessingScanRef.current = true;
          const patient = (res as any).patient;
          const finalPercent = res.similarityPercentage ?? medianPercent;
          const finalDistance = typeof res.distance === 'number' ? res.distance : medianDistance;

          setMatchedPatient(patient);
          setSimilarityInfo({
            percent: finalPercent,
            distance: finalDistance,
          });
          setStatusText(
            lang === 'zh-CN'
              ? `身份验证成功：${patient.first_name}（${finalPercent}%）`
              : lang === 'en-US'
              ? `Identity Verified: ${patient.first_name} (${finalPercent}%)`
              : `ยืนยันตัวตนสำเร็จ: คุณ ${patient.first_name} (${finalPercent}%)`
          );
          return;
        }
      }

      // 5. Low Match (< 50% or unmatched): Failure path
      scanFailureCountRef.current++;
      const now = Date.now();
      failedScanTimestampsRef.current.push(now);
      failedScanTimestampsRef.current = failedScanTimestampsRef.current.filter((t) => now - t <= 60000);

      // Rate limit check: >= 5 failed attempts in 1 minute
      if (failedScanTimestampsRef.current.length >= 5) {
        setRateLimitCooldownSec(30);
        const cooldownMsg = lang === 'zh-CN'
          ? '⚠️ 1分钟内连续扫描失败超过5次，请等待30秒冷却或联系前台工作人员'
          : lang === 'en-US'
          ? '⚠️ More than 5 failed scans in 1 minute. Please wait 30s cooldown or call staff'
          : '⚠️ สแกนไม่สำเร็จติดต่อกัน 5 ครั้งใน 1 นาที กรุณารอ 30 วินาที หรือติดต่อเจ้าหน้าที่เวชระเบียน';
        setStatusText(cooldownMsg);
        setUnrecognizedAlert(cooldownMsg);
        isProcessingScanRef.current = false;
        setIsScanning(false);
        return;
      }

      const failMsg = lang === 'zh-CN'
        ? `⚠️ 未找到匹配账户（相似度 ${medianPercent}% 未达80%）。请将面部对准圆框重试，或使用PIN码登录`
        : lang === 'en-US'
        ? `⚠️ Account not found (${medianPercent}% match <80% threshold). Please center face in circle or use PIN`
        : `⚠️ ไม่พบบัญชีในระบบ (ความแม่นยำ ${medianPercent}% ไม่ถึงเกณฑ์ 80%) กรุณาวางใบหน้าให้อยู่ในกรอบวงกลมแล้วลองใหม่อีกครั้ง หรือเข้าด้วยรหัส PIN`;
      setStatusText(failMsg);
      setUnrecognizedAlert(failMsg);

      if (scanFailureCountRef.current >= 2) {
        setTimeout(() => {
          if (isMountedRef.current && !matchedPatient) {
            setIsPinModalOpen(true);
          }
        }, 600);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการประมวลผลใบหน้า';
      setStatusText(msg);
      setUnrecognizedAlert(msg);
    } finally {
      if (isMountedRef.current) {
        isProcessingScanRef.current = false;
        setIsScanning(false);
      }
    }
  }, [isScanningPaused, matchedPatient, lang]);

  // Start 3-Second Countdown & 250ms periodic embedding extraction
  const startCountdown = useCallback(() => {
    if (
      isCountingDownRef.current ||
      isScanning ||
      isProcessingScanRef.current ||
      isScanningPaused ||
      matchedPatient ||
      rateLimitCooldownSec > 0
    ) {
      return;
    }

    isCountingDownRef.current = true;
    countdownStartTimeRef.current = Date.now();
    sampleFramesRef.current = [];
    setCountdownValue(3);
    setRealtimeScore(null);
    setStatusText(
      lang === 'zh-CN'
        ? '正在倒计时识别人脸... 请保持稳定'
        : lang === 'en-US'
        ? 'Scanning face... Please stay still'
        : 'กำลังนับถอยหลังและสแกนใบหน้า... กรุณามองตรงที่กล้อง'
    );

    const interval = setInterval(async () => {
      if (!isMountedRef.current || isScanningPaused) {
        cancelCountdown();
        return;
      }

      const elapsed = Date.now() - countdownStartTimeRef.current;

      // Update countdown numbers 3 -> 2 -> 1
      if (elapsed < 1000) {
        setCountdownValue(3);
      } else if (elapsed < 2000) {
        setCountdownValue(2);
      } else if (elapsed < 3000) {
        setCountdownValue(1);
      } else {
        clearInterval(interval);
        countdownIntervalRef.current = null;
        setCountdownValue(null);
        finishCountdownAndVerify();
        return;
      }

      // Periodic 250ms feature extraction & local matching
      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
          const { camera, detector, aligner, embeddingModel } = services;
          const rawFrame = camera.captureRotatedFrame(videoRef.current);
          const detection = await detector.detect(rawFrame);

          if (!detection.hasFace) {
            cancelCountdown(lang === 'zh-CN' ? '请将面部对准圆框' : lang === 'en-US' ? 'Align face inside circle' : 'กรุณาจัดใบหน้าให้อยู่ในกรอบวงกลม');
            return;
          }

          const roi = checkFaceROIInCircle(detection, rawFrame.width, rawFrame.height, {
            maxCenterDistance: 0.32,
            minFaceWidthRatio: 0.10,
            minBorderMargin: 0.05,
          });

          if (!roi.inCircle) {
            cancelCountdown(lang === 'zh-CN' ? '面部离开圆框，已取消' : lang === 'en-US' ? 'Face left circle, cancelled' : 'ใบหน้าออกจากกรอบวงกลม ระบบได้รีเซ็ตการสแกน');
            return;
          }

          const liv = fastLivenessVerifierRef.current.evaluate(detection);
          setLivenessResult(liv);
          if (liv.state === 'spoof_blocked' || (!liv.isLive && liv.depthScore < 0.20)) {
            cancelCountdown(t('kiosk_spoof_blocked'));
            return;
          }

          // Extract 512-D embedding
          let vector: number[] | null = null;
          if (detection.landmarks) {
            const aligned = aligner.align(rawFrame, detection.landmarks);
            vector = await embeddingModel.embed(aligned);
            const actx = aligned.getContext?.('2d');
            if (actx) actx.clearRect(0, 0, aligned.width, aligned.height);
          } else if (detection.box && detection.box.width > 20) {
            const faceCrop = document.createElement('canvas');
            faceCrop.width = 112;
            faceCrop.height = 112;
            const fcCtx = faceCrop.getContext('2d');
            if (fcCtx) {
              const fw = rawFrame.width || 640;
              const fh = rawFrame.height || 480;
              const pad = detection.box.width * 0.15;
              const sx = Math.max(0, detection.box.x - pad);
              const sy = Math.max(0, detection.box.y - pad);
              const sw = Math.min(fw - sx, detection.box.width + pad * 2);
              const sh = Math.min(fh - sy, detection.box.height + pad * 2);
              fcCtx.drawImage(rawFrame, sx, sy, sw, sh, 0, 0, 112, 112);
              vector = await embeddingModel.embed(faceCrop);
            }
          }

          if (vector && vector.length === 512) {
            // Match against cached patients
            let top1Cand: CachedPatientBiometric | null = null;
            let top1Sim = 0;
            let top2Cand: CachedPatientBiometric | null = null;
            let top2Sim = 0;

            for (const cand of cachedPatientsRef.current) {
              let candBestSim = 0;
              for (const cv of cand.vectors) {
                if (cv.length === 512) {
                  let dot = 0;
                  for (let i = 0; i < 512; i++) {
                    dot += vector[i] * cv[i];
                  }
                  if (dot > candBestSim) candBestSim = dot;
                }
              }
              if (candBestSim > top1Sim) {
                top2Sim = top1Sim;
                top2Cand = top1Cand;
                top1Sim = candBestSim;
                top1Cand = cand;
              } else if (candBestSim > top2Sim) {
                top2Sim = candBestSim;
                top2Cand = cand;
              }
            }

            const currentPercent = Math.max(0, Math.min(100, Math.round(top1Sim * 100)));
            const currentDist = Math.sqrt(Math.max(0, 2 - 2 * top1Sim));

            sampleFramesRef.current.push({
              vector,
              score: top1Sim,
              percent: currentPercent,
              distance: currentDist,
              candidateId: top1Cand?.id,
              candidateName: top1Cand?.name,
              candidateHn: top1Cand?.hn,
              secondCandidate: top2Cand ? { name: top2Cand.name, hn: top2Cand.hn, score: Math.round(top2Sim * 100) } : undefined,
              liveness: liv,
              timestamp: Date.now(),
            });

            setRealtimeScore(currentPercent);

            const allPercents = sampleFramesRef.current.map((s) => s.percent).sort((a, b) => a - b);
            const medPerc = allPercents[Math.floor(allPercents.length / 2)] || currentPercent;
            setCalibrationStats({
              currentCos: top1Sim,
              currentDist: currentDist,
              currentPercent,
              medianPercent: medPerc,
              minPercent: allPercents[0] || currentPercent,
              maxPercent: allPercents[allPercents.length - 1] || currentPercent,
              samplesCount: sampleFramesRef.current.length,
              depthScore: liv.depthScore,
              ear: liv.ear || 0.30,
              top1: top1Cand ? { name: top1Cand.name, hn: top1Cand.hn, score: currentPercent } : undefined,
              top2: top2Cand ? { name: top2Cand.name, hn: top2Cand.hn, score: Math.round(top2Sim * 100) } : undefined,
            });
          }
        } catch {}
      }
    }, 250);

    countdownIntervalRef.current = interval;
  }, [cancelCountdown, finishCountdownAndVerify, isScanning, isScanningPaused, matchedPatient, rateLimitCooldownSec, lang, t]);

  // Trigger manual scan (activates countdown if face is aligned)
  const executeScanLogin = useCallback(() => {
    if (isScanning || isProcessingScanRef.current || isScanningPaused) return;
    if (rateLimitCooldownSec > 0) {
      alert(`กรุณารอระบบคูลดาวน์ ${rateLimitCooldownSec} วินาที`);
      return;
    }
    if (!faceInCircle) {
      setStatusText('⚠️ กรุณาจัดใบหน้าให้อยู่ในกรอบวงกลมก่อนเริ่มสแกน');
      return;
    }
    startCountdown();
  }, [faceInCircle, isScanning, isScanningPaused, rateLimitCooldownSec, startCountdown]);

  // ISOLATED CAMERA LIFECYCLE
  useEffect(() => {
    isMountedRef.current = true;
    preloadFaceModels();
    startCamera();

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Tab visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && !isCameraStartedRef.current && !userDisabledCamera) {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startCamera, userDisabledCamera]);

  // PREVIEW CANVAS RENDER LOOP (Runs on requestAnimationFrame)
  useEffect(() => {
    if (isScanningPaused || !cameraReady) return;

    let animId: number;
    const services = getFaceClientServices(customDetectorRef.current ? { customDetector: customDetectorRef.current } : undefined);
    const { camera } = services;

    const renderLoop = () => {
      if (!isMountedRef.current || isScanningPaused) return;
      if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        camera.setRotation(cameraRotationRef.current);
        camera.setMirrorPreview(isMirroredRef.current);
        camera.renderPreview(previewCanvasRef.current, videoRef.current, isMirroredRef.current);
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [cameraReady, isScanningPaused]);

  // DETECTION & PRESENCE LOOP (160ms throttled)
  const prevFaceInCircleRef = useRef<boolean>(false);
  const prevPresenceDetectedRef = useRef<boolean>(false);
  const prevLivenessStateRef = useRef<string>('');
  const prevStatusTextRef = useRef<string>('');

  useEffect(() => {
    if (isScanningPaused || !cameraReady) return;

    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
    const { detector, inputManager } = services;

    inputManager.setIdleMode(true);

    const unsubscribe = inputManager.subscribe((event) => {
      if (!isMountedRef.current || isScanningPaused) return;
      if (event.type === 'PRESENCE_DETECTED') {
        if (!prevPresenceDetectedRef.current) {
          prevPresenceDetectedRef.current = true;
          setPresenceDetected(true);
        }
        const text = 'ตรวจพบผู้ป่วย จัดท่านั่งและมองกล้อง';
        if (prevStatusTextRef.current !== text) {
          prevStatusTextRef.current = text;
          setStatusText(text);
        }
      }
    });

    const presenceInterval = setInterval(async () => {
      if (!isMountedRef.current || isScanningPaused || isScanning) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const vw = videoRef.current.videoWidth || 640;
          const vh = videoRef.current.videoHeight || 480;

          let dCanvas = detectCanvasRef.current;
          if (!dCanvas) {
            dCanvas = document.createElement('canvas');
            detectCanvasRef.current = dCanvas;
          }
          const targetW = 480;
          const scale = Math.min(1.0, targetW / vw);
          const dw = Math.round(vw * scale);
          const dh = Math.round(vh * scale);
          if (dCanvas.width !== dw || dCanvas.height !== dh) {
            dCanvas.width = dw;
            dCanvas.height = dh;
          }
          const dctx = dCanvas.getContext('2d', { willReadFrequently: true });
          if (dctx) {
            dctx.drawImage(videoRef.current, 0, 0, dw, dh);
          }

          const res = await detector.detect(dCanvas);

          if (res.hasFace && res.box) {
            const roi = checkFaceROIInCircle(res, dw, dh, {
              maxCenterDistance: 0.32,
              minFaceWidthRatio: 0.10,
              minBorderMargin: 0.05,
            });

            if (!roi.inCircle) {
              consecutiveSteadyFramesRef.current = 0;
              if (isCountingDownRef.current) {
                cancelCountdown('จัดตำแหน่งใบหน้าให้อยู่ในกรอบวงกลม');
              }
              if (prevFaceInCircleRef.current !== false) {
                prevFaceInCircleRef.current = false;
                setFaceInCircle(false);
              }
              if (prevPresenceDetectedRef.current !== false) {
                prevPresenceDetectedRef.current = false;
                setPresenceDetected(false);
              }
              const msg = t('kiosk_align_face');
              if (prevStatusTextRef.current !== msg) {
                prevStatusTextRef.current = msg;
                setStatusText(msg);
              }
              inputManager.processFaceDetection(null, performance.now());
            } else {
              if (prevFaceInCircleRef.current !== true) {
                prevFaceInCircleRef.current = true;
                setFaceInCircle(true);
              }
              const liv = fastLivenessVerifierRef.current.evaluate(res);
              if (prevLivenessStateRef.current !== liv.state) {
                prevLivenessStateRef.current = liv.state;
                setLivenessResult(liv);
              }

              if (liv.state === 'live_verified') {
                if (prevPresenceDetectedRef.current !== true) {
                  prevPresenceDetectedRef.current = true;
                  setPresenceDetected(true);
                }

                // Face is steady & live -> Start 3-second countdown!
                consecutiveSteadyFramesRef.current++;
                if (
                  !isCountingDownRef.current &&
                  !isScanning &&
                  !isProcessingScanRef.current &&
                  !isScanningPaused &&
                  !matchedPatient &&
                  rateLimitCooldownSec === 0
                ) {
                  startCountdown();
                }
              } else if (liv.state === 'spoof_blocked') {
                consecutiveSteadyFramesRef.current = 0;
                if (isCountingDownRef.current) {
                  cancelCountdown(t('kiosk_spoof_blocked'));
                }
                const msg = t('kiosk_spoof_blocked');
                if (prevStatusTextRef.current !== msg) {
                  prevStatusTextRef.current = msg;
                  setStatusText(msg);
                }
              } else {
                consecutiveSteadyFramesRef.current = 0;
                const msg = '🟡 กำลังตรวจสอบความมีชีวิต...';
                if (prevStatusTextRef.current !== msg) {
                  prevStatusTextRef.current = msg;
                  setStatusText(msg);
                }
              }

              inputManager.processFaceDetection(
                {
                  x: res.box.x / dw,
                  y: res.box.y / dh,
                  width: res.box.width / dw,
                  height: res.box.height / dh,
                },
                performance.now()
              );
            }
          } else {
            consecutiveSteadyFramesRef.current = 0;
            if (isCountingDownRef.current) {
              cancelCountdown('กรุณาก้าวมายืนหน้าตู้เพื่อเริ่มต้น');
            }
            if (prevFaceInCircleRef.current !== false) {
              prevFaceInCircleRef.current = false;
              setFaceInCircle(false);
            }
            if (prevPresenceDetectedRef.current !== false) {
              prevPresenceDetectedRef.current = false;
              setPresenceDetected(false);
            }
            const msg = t('kiosk_align_face');
            if (prevStatusTextRef.current !== msg) {
              prevStatusTextRef.current = msg;
              setStatusText(msg);
            }
            inputManager.processFaceDetection(null, performance.now());
          }
        } catch {}
      }
    }, 160);

    return () => {
      clearInterval(presenceInterval);
      unsubscribe();
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [cameraReady, isScanningPaused, customDetector, isScanning, matchedPatient, rateLimitCooldownSec, startCountdown, cancelCountdown, t]);

  const handleResetScan = () => {
    resetConfirmation();
    setIdentityAnchor(null);
    setUnrecognizedAlert(null);
    setMatchedPatient(null);
    setLivenessResult(null);
    fastLivenessVerifierRef.current.start();
    consecutiveSteadyFramesRef.current = 0;
    isProcessingScanRef.current = false;
    scanFailureCountRef.current = 0;
    cancelCountdown();
    setStatusText('เตรียมสแกนใหม่อีกครั้ง...');
  };

  const handleRetryCamera = () => {
    setUserDisabledCamera(false);
    isCameraStartedRef.current = false;
    startCamera();
  };

  // Patient login via PIN
  const handlePinLoginSuccess = async () => {
    setIsPinModalOpen(false);
    const pin = enteredPin.trim();
    if (!pin) return;

    try {
      const pinRes = await defaultApiClient.smartOnboarding.pinLogin({
        pin,
        probe: lastProbeVectorRef.current || undefined,
      });
      if (pinRes?.matched && pinRes.patient) {
        setStatusText('เข้าสู่ระบบสำเร็จ พร้อมอัปเดตข้อมูลชีวมาตรใบหน้าล่าสุด');
        onLoginSuccess(pinRes.patient);
        return;
      }
    } catch {}

    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(pin)}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        if (list.length > 0) {
          const p = list[0];
          onLoginSuccess({
            patient_id: p.id,
            hn: p.hn,
            first_name: p.first_name,
            last_name: p.last_name,
            age: p.age,
            gender: p.sex === 'F' || p.sex === 'female' ? 'female' : 'male',
            registration_status: p.registration_status,
            registered_via: p.registered_via || 'kiosk',
            biometrics: {
              face_vector: p.history?.face_vector || new Array(512).fill(0),
              registered_face_url: `/uploads/patients/${p.id}/profile_face.jpg`,
              confidence_score: 1.0,
              model_version: 'w600k_r50',
              enrolled_at: p.created_at || new Date().toISOString(),
            },
            daily_checklists: {},
            rehab_scores: [],
            clinical: {
              diagnosis: p.injury || 'กายภาพบำบัดฟื้นฟู',
              treatment_plan: 'โปรแกรมฟื้นฟูสมรรถภาพทางกายภาพบำบัด',
              progress_notes: [],
            },
            created_at: p.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return;
        }
      }
    } catch {}
    setUnrecognizedAlert(`ไม่พบข้อมูลผู้ป่วยสำหรับรหัส "${pin}" (กรุณาตรวจสอบรหัส HN หรือลงทะเบียนคนไข้ใหม่)`);
  };

  const handlePinKey = (digit: string) => {
    if (enteredPin.length < 4) {
      const next = enteredPin + digit;
      setEnteredPin(next);
      if (next.length === 4) {
        setTimeout(handlePinLoginSuccess, 300);
      }
    }
  };

  return (
    <div className="w-full h-full min-h-screen relative flex items-center justify-center p-4 bg-gradient-to-br from-[#E6F8F5] via-[#F4FBF9] to-[#E0F2FE] text-[#063932] select-none overflow-hidden font-sans">
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '320px',
          height: '240px',
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* Ambient Top-Right Decorative Aesthetics */}
      <div className="absolute top-0 right-0 w-[480px] h-[480px] bg-[radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.16)_0%,rgba(14,165,233,0.10)_40%,transparent_70%)] pointer-events-none z-0" />
      <div className="absolute top-6 right-7 w-52 h-52 bg-[radial-gradient(#0EA5E9_1px,transparent_1px)] bg-[size:16px_16px] opacity-20 pointer-events-none z-0" />

      {/* Centered Vertical Kiosk Card */}
      <div className="w-full max-w-[440px] bg-white border-[1.5px] border-[#1E293B] rounded-[28px] shadow-2xl shadow-emerald-950/10 p-6 flex flex-col relative z-10 animate-scale-up">
        
        {/* 1. Camera Box */}
        <div className="w-full min-h-[160px] rounded-2xl relative overflow-hidden">
          {!cameraReady ? (
            /* Fallback Box: Yellow Amber Dashed */
            <div className="w-full bg-[#FFFBEB] border-[1.5px] border-dashed border-[#F59E0B] rounded-2xl p-4 text-center flex flex-col items-center justify-center">
              <div className="w-7 h-7 rounded-full border-2 border-[#F59E0B] text-[#F59E0B] flex items-center justify-center font-bold text-xs mb-1.5">
                {userDisabledCamera || isScanningPaused ? '⏸️' : '!'}
              </div>
              <h3 className="text-sm font-bold text-[#78350F]">
                {userDisabledCamera || isScanningPaused ? 'หยุดการสแกนชั่วคราว' : 'กล้องยังไม่พร้อมใช้งาน'}
              </h3>
              <p className="text-[11px] text-[#B45309] font-medium mt-0.5 mb-3.5">
                {userDisabledCamera || isScanningPaused
                  ? 'ระบบหยุดตรวจจับใบหน้าอัตโนมัติขณะเปิดเมนูอื่น หรือเมื่อกดหยุดสแกน'
                  : 'กรุณาอนุญาตการใช้กล้อง หรือใช้รหัส PIN แทน'}
              </p>

              <button
                type="button"
                onClick={handleRetryCamera}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] to-[#2563EB] text-white text-xs font-bold shadow-md shadow-emerald-500/25 hover:brightness-105 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{userDisabledCamera || isScanningPaused ? 'เปิดกล้องเริ่มสแกนใหม่' : 'ลองเปิดกล้องอีกครั้ง'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setEnteredPin('');
                  setIsPinModalOpen(true);
                }}
                className="w-full py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#334155] text-xs font-semibold shadow-xs hover:bg-slate-50 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5 mt-2"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span>ใช้รหัส PIN แทน</span>
              </button>
            </div>
          ) : (
            /* Active Live Camera Box */
            <div
              onClick={() => executeScanLogin()}
              className="w-full h-52 rounded-2xl bg-[#02201C] border-2 border-[#10B981] relative overflow-hidden flex items-center justify-center cursor-pointer group hover:border-emerald-300 transition"
              title="แตะที่นี่เพื่อสแกนใบหน้าทันที"
            >
              <canvas ref={previewCanvasRef} className="w-full h-full object-cover" />

              {/* Real-time Liveness Telemetry Badge */}
              <div className="absolute top-2 inset-x-0 flex justify-center z-20 pointer-events-none">
                <LivenessTelemetryBadge
                  state={livenessResult?.state || 'checking'}
                  statusMessageThai={livenessResult?.statusMessageThai}
                  depthScore={livenessResult?.depthScore}
                  ear={livenessResult?.ear}
                  isBlinking={livenessResult?.blinkVerified}
                />
              </div>

              {/* Reticle Circle / Face scan guide with 3s Countdown & Live Score % */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div
                  className={`w-32 h-40 rounded-full transition-all duration-300 relative flex items-center justify-center ${
                    countdownValue !== null
                      ? 'border-4 border-emerald-400 shadow-[0_0_35px_rgba(16,185,129,0.95)] ring-4 ring-emerald-500/40 animate-pulse'
                      : !faceInCircle
                      ? 'border-2 border-dashed border-amber-400/90 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
                      : livenessResult?.state === 'live_verified'
                      ? 'border-2 border-emerald-400 shadow-[0_0_22px_rgba(16,185,129,0.55)]'
                      : livenessResult?.state === 'spoof_blocked'
                      ? 'border-2 border-rose-400 shadow-[0_0_22px_rgba(244,63,94,0.55)]'
                      : 'border-2 border-dashed border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
                  }`}
                >
                  {/* Big Animated Countdown Number in the Center */}
                  {countdownValue !== null ? (
                    <div className="flex flex-col items-center justify-center select-none animate-scale-up">
                      <div className="text-7xl font-black text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] tracking-tighter leading-none">
                        {countdownValue}
                      </div>
                      <div className="mt-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-emerald-400 text-emerald-300 font-black text-xs shadow-lg flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>{realtimeScore !== null ? `${realtimeScore}%` : 'สแกน...'}</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`absolute left-[10%] w-[80%] h-0.5 ${
                        !faceInCircle
                          ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent'
                          : 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-bounce'
                      } top-1/2`}
                    />
                  )}
                </div>

                {/* Status Pill Badge at bottom of camera box */}
                <div className="absolute bottom-2 px-3 py-1 rounded-full bg-[#042924]/85 backdrop-blur-md border border-emerald-500/40 text-[11px] font-bold text-emerald-300 flex items-center gap-1.5 shadow-md max-w-[90%] truncate">
                  {countdownValue !== null ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-300 shrink-0" />
                      <span className="text-emerald-300 truncate">
                        {lang === 'zh-CN' ? `正在识别倒计时 ${countdownValue}...` : lang === 'en-US' ? `Counting down ${countdownValue}...` : `กำลังนับถอยหลัง ${countdownValue} วินาที...`}
                      </span>
                    </>
                  ) : isScanning ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-cyan-300 shrink-0" />
                      <span className="truncate">{statusText || t('kiosk_verifying_identity')}</span>
                    </>
                  ) : matchedPatient ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate">{t('kiosk_identity_verified')}: คุณ {matchedPatient.first_name}</span>
                    </>
                  ) : rateLimitCooldownSec > 0 ? (
                    <>
                      <span className="text-amber-300 font-bold shrink-0">⏳ คูลดาวน์ {rateLimitCooldownSec}s</span>
                    </>
                  ) : !presenceDetected || !faceInCircle ? (
                    <>
                      <span className="text-amber-300 font-semibold truncate">🟡 {statusText || t('kiosk_align_face')}</span>
                    </>
                  ) : livenessResult?.state === 'spoof_blocked' ? (
                    <>
                      <span className="text-rose-300 font-semibold truncate">{t('kiosk_spoof_blocked')}</span>
                    </>
                  ) : livenessResult?.state === 'live_verified' ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-300 shrink-0" />
                      <span className="text-emerald-300 font-semibold truncate">พร้อมเริ่มนับถอยหลัง</span>
                    </>
                  ) : (
                    <>
                      <span className="text-cyan-300 font-medium truncate">🟡 {t('kiosk_checking_liveness')}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Calibration Mode HUD Overlay */}
              {isCalibrationOpen && (
                <div
                  className="absolute top-9 left-2 right-2 bg-slate-950/90 backdrop-blur-md border border-cyan-400/50 rounded-xl p-2.5 text-[10px] font-mono text-cyan-200 z-30 shadow-2xl space-y-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-cyan-500/30 pb-1">
                    <span className="font-bold text-white flex items-center gap-1">
                      🎯 Calibration HUD (250ms Median)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCalibrationOpen(false)}
                      className="text-slate-400 hover:text-white px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-0.5">
                    <div>cos(θ): <b className="text-white">{calibrationStats?.currentCos.toFixed(3) ?? '0.000'}</b></div>
                    <div>Euclid: <b className="text-white">{calibrationStats?.currentDist.toFixed(3) ?? '2.000'}</b></div>
                    <div>Score: <b className="text-emerald-400">{calibrationStats?.currentPercent ?? 0}%</b></div>
                    <div>3D Depth: <b className="text-white">{livenessResult?.depthScore.toFixed(3) ?? '0.000'}</b></div>
                    <div>EAR: <b className="text-white">{livenessResult?.ear?.toFixed(2) ?? '0.00'}</b></div>
                    <div>Liveness: <b className={livenessResult?.isLive ? 'text-emerald-400' : 'text-amber-400'}>{livenessResult?.state ?? 'idle'}</b></div>
                  </div>
                  <div className="text-[10px] text-slate-300 pt-0.5 border-t border-slate-800">
                    Samples: <b className="text-white">{calibrationStats?.samplesCount ?? 0}</b> | Median: <b className="text-emerald-300">{calibrationStats?.medianPercent ?? 0}%</b> (Min: {calibrationStats?.minPercent ?? 0}% / Max: {calibrationStats?.maxPercent ?? 0}%)
                  </div>
                  {calibrationStats?.top1 && (
                    <div className="text-[10px] text-emerald-300 truncate">
                      Top 1: {calibrationStats.top1.name} ({calibrationStats.top1.hn}) - {calibrationStats.top1.score}%
                    </div>
                  )}
                  {calibrationStats?.top2 && (
                    <div className="text-[10px] text-slate-400 truncate">
                      Top 2: {calibrationStats.top2.name} ({calibrationStats.top2.hn}) - {calibrationStats.top2.score}%
                    </div>
                  )}
                </div>
              )}

              {/* Camera Orientation Controls & Calibration Button */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
                    const next = rotations[(rotations.indexOf(cameraRotation) + 1) % rotations.length];
                    setCameraRotation(next);
                    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
                    services.camera.setRotation(next);
                  }}
                  className="px-2 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[10px] font-semibold flex items-center gap-1 backdrop-blur-sm transition border border-white/20 cursor-pointer"
                  title="หมุนกล้อง 90 องศา"
                >
                  <RotateCw className="w-3 h-3 text-cyan-300" />
                  <span>{cameraRotation}°</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMirrored((prev) => !prev);
                    const services = getFaceClientServices(customDetector ? { customDetector } : undefined);
                    services.camera.setMirrorPreview(!isMirrored);
                  }}
                  className={`p-1.5 rounded-lg text-white text-[10px] font-semibold flex items-center backdrop-blur-sm transition border border-white/20 cursor-pointer ${
                    isMirrored ? 'bg-emerald-600/70' : 'bg-black/60'
                  }`}
                  title="สลับกลับหัว / กระจก"
                >
                  <FlipHorizontal className="w-3 h-3 text-emerald-300" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCalibrationOpen((prev) => !prev)}
                  className={`px-2 py-1 rounded-lg text-white text-[10px] font-semibold flex items-center gap-1 backdrop-blur-sm transition border border-white/20 cursor-pointer ${
                    isCalibrationOpen ? 'bg-cyan-600/80 border-cyan-400' : 'bg-black/60 hover:bg-black/80'
                  }`}
                  title="เปิด/ปิดโหมดสอบเทียบ (Calibration Mode)"
                >
                  <Activity className="w-3 h-3 text-cyan-300" />
                  <span>Calib</span>
                </button>
              </div>

              {/* Close/Toggle Camera button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserDisabledCamera(true);
                  stopCamera();
                }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-rose-600 transition cursor-pointer z-20"
                title="หยุดสแกน / ปิดกล้อง"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* 2. Middle Emblem & Manual Trigger */}
        <div
          onClick={() => executeScanLogin()}
          className="relative w-36 h-36 mx-auto my-3 flex items-center justify-center cursor-pointer group"
          title="แตะเพื่อเริ่มสแกนใบหน้าเข้าใช้งาน"
        >
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#38BDF8] rounded-tl-sm pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#38BDF8] rounded-tr-sm pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#38BDF8] rounded-bl-sm pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#38BDF8] rounded-br-sm pointer-events-none group-hover:scale-110 transition-transform" />

          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-[#10B981] to-[#0EA5E9] p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 active:scale-95 transition-transform">
            <div className="w-full h-full bg-white rounded-full border border-slate-100 flex flex-col items-center justify-center p-2 text-center">
              <svg className="w-10 h-10 mb-0.5" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M48 20 C30 20 18 34 18 52 C18 69 31 82 48 82 C44 76 40 68 40 52 C40 38 43 27 48 20 Z" fill="#0284C7" />
                <path d="M52 80 C70 80 82 66 82 48 C82 31 69 18 52 18 C56 24 60 32 60 48 C60 62 57 73 52 80 Z" fill="#10B981" />
                <path d="M44 38 H56 V44 H62 V56 H56 V62 H44 V56 H38 V44 H44 Z" fill="#10B981" />
                <path d="M47 41 H53 V47 H59 V53 H53 V59 H47 V53 H41 V47 H47 Z" fill="#0284C7" />
                <circle cx="50" cy="50" r="4" fill="#FFFFFF" />
              </svg>
              <div className="text-[9px] font-extrabold text-[#0369A1] tracking-wider leading-tight">
                DR TECH CARE
              </div>
              <div className="text-[6px] font-semibold text-slate-400 tracking-wider uppercase">
                Health Technology
              </div>
            </div>
          </div>
        </div>

        {/* 3. AI Instructions Green Pill Banner */}
        <div
          onClick={() => executeScanLogin()}
          className="bg-[#ECFDF5] border border-[#6EE7B7] rounded-xl p-2.5 flex items-center gap-2.5 mb-2.5 text-left cursor-pointer hover:bg-emerald-100/70 active:scale-[0.99] transition shadow-xs"
          title="แตะเพื่อเริ่มสแกน"
        >
          <span className="text-xl leading-none shrink-0 animate-bounce">🙌</span>
          <div>
            <div className="font-bold text-xs text-[#065F46] leading-snug">
              {lang === 'zh-CN' ? '您准备好进行康复训练了吗？请举起双手或点击此处' : lang === 'en-US' ? 'Ready for rehab? Raise both hands or tap here' : 'คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้น หรือแตะที่นี่'}
            </div>
            <div className="text-[10px] text-[#059669] leading-snug mt-0.5 font-medium">
              {lang === 'zh-CN' ? '人脸即时自动识别，或点击下方按钮登录' : lang === 'en-US' ? 'Instant auto-face scan or tap below to login' : 'สแกนใบหน้าอัตโนมัติทันที หรือแตะปุ่มด้านล่างเพื่อเข้าสู่ระบบ'}
            </div>
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="w-full flex flex-col gap-2 mb-2">
          {/* Primary Action Button: Scan Face Now */}
          <button
            type="button"
            id="kiosk-scan-face-btn"
            data-testid="kiosk-scan-face-btn"
            disabled={isScanning || isCountingDownRef.current}
            onClick={() => executeScanLogin()}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#059669] to-[#0284C7] hover:from-[#059669] hover:to-[#0369A1] text-white font-extrabold text-sm shadow-md shadow-emerald-500/25 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 border border-emerald-400/30"
          >
            {countdownValue !== null ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>กำลังนับถอยหลัง {countdownValue}...</span>
              </>
            ) : isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>{t('kiosk_verifying_identity')}</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 text-emerald-100" />
                <span>{t('kiosk_scan_face_now')}</span>
              </>
            )}
          </button>

          {/* Secondary Action Row: PIN Login & New Patient */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="kiosk-pin-login-btn"
              data-testid="kiosk-pin-login-btn"
              onClick={() => {
                stopCamera();
                setEnteredPin('');
                setIsPinModalOpen(true);
              }}
              className="py-2.5 px-3 rounded-xl bg-white border border-[#CBD5E1] text-[#1E293B] text-xs font-bold hover:bg-slate-50 hover:border-slate-400 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>ใช้รหัส PIN 4 หลัก</span>
            </button>

            <button
              type="button"
              id="kiosk-enroll-new-btn"
              data-testid="kiosk-enroll-new-btn"
              onClick={() => {
                stopCamera();
                if (onOpenNewPatientModal) {
                  onOpenNewPatientModal();
                } else {
                  onNavigateToEnroll();
                }
              }}
              className="py-2.5 px-3 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50 hover:border-blue-300 active:scale-98 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>➕ สมัครคนไข้ใหม่</span>
            </button>
          </div>
        </div>

        {/* 4. Footer Branding */}
        <div className="text-center mt-0.5">
          <h2 className="text-lg sm:text-xl font-extrabold text-[#064E3B] tracking-normal">
            Dr.Tech.Care
          </h2>
          <div>
            <span className="inline-block mt-1 px-3.5 py-0.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[11px] font-bold">
              ระบบกายภาพบำบัดและดูแลสุขภาพอัจฉริยะ
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Smooth Mint Waves */}
      <div className="absolute bottom-0 left-0 w-full h-48 pointer-events-none z-0 overflow-hidden">
        <svg className="w-full h-full block" viewBox="0 0 1440 280" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 160 C320 100 480 220 800 160 C1120 100 1280 180 1440 140 V280 H0 Z" fill="#C7F1E7" fillOpacity="0.35" />
          <path d="M0 180 C240 240 540 140 840 200 C1140 260 1340 160 1440 190 V280 H0 Z" fill="#E6F8F5" fillOpacity="0.65" />
          <path d="M0 210 C360 170 600 240 960 210 C1200 190 1380 230 1440 220 V280 H0 Z" fill="#A7F3D0" fillOpacity="0.4" />
        </svg>
      </div>

      {/* Bottom-Right Floating Action Pills */}
      <div className="fixed bottom-6 right-7 flex items-center gap-3 z-30">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setIsAboutModalOpen(true);
          }}
          className="px-4 py-1.5 rounded-full bg-white border border-[#CBD5E1] text-[#475569] text-xs font-semibold shadow-md hover:-translate-y-0.5 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Info className="w-3.5 h-3.5 text-slate-500" />
          <span>เกี่ยวกับระบบ</span>
        </button>

        <button
          id="open-staff-login-btn"
          data-testid="open-staff-login-btn"
          type="button"
          onClick={() => {
            stopCamera();
            onOpenStaffLoginModal?.();
          }}
          title="เข้าสู่ระบบบุคลากร / รพ."
          className="px-4 py-1.5 rounded-full bg-white border-[1.5px] border-[#10B981] text-[#065F46] text-xs font-bold shadow-md shadow-emerald-500/15 hover:-translate-y-0.5 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>🛡️ เข้าสู่ระบบบุคลากร / รพ.</span>
        </button>
      </div>

      {/* Modal: Virtual PIN Pad */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-emerald-500/30 p-6 text-center shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => setIsPinModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              🔑
            </div>
            <h3 className="text-lg font-bold text-slate-800">ยืนยันตัวตนด้วยรหัส PIN</h3>
            <p className="text-xs text-slate-500 mt-0.5">กรอกรหัส PIN 4 หลักประจำตัวผู้ป่วยเพื่อเริ่มฝึก</p>

            <div className="flex justify-center gap-3 my-5">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    idx < enteredPin.length
                      ? 'bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/50 scale-110'
                      : 'border-slate-300 bg-transparent'
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinKey(digit)}
                  className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEnteredPin('')}
                className="h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-200 active:scale-95 transition cursor-pointer"
              >
                ล้าง
              </button>
              <button
                type="button"
                onClick={() => handlePinKey('0')}
                className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold text-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setEnteredPin((prev) => prev.slice(0, -1))}
                className="h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-200 active:scale-95 transition cursor-pointer"
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Identity Confirmation when Matched */}
      {matchedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border-2 border-emerald-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-24 h-24 rounded-full mx-auto p-1 bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-xl mb-4">
              <img
                src={matchedPatient.biometrics.registered_face_url}
                alt="Profile Face"
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>ความแม่นยำชีวมาตร {similarityInfo?.percent}% (ผ่านเกณฑ์)</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              คุณ {matchedPatient.first_name}{matchedPatient.last_name && matchedPatient.last_name !== '-' ? ` ${matchedPatient.last_name}` : ''}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              HN: <span className="font-mono text-blue-600">{matchedPatient.hn}</span> • อายุ: {matchedPatient.age} ปี
            </p>

            {/* Gesture Prompt & Real-time Thai Feedback */}
            <div
              className={`my-4 p-3.5 rounded-2xl border transition-all duration-200 relative overflow-hidden ${
                gestureProgress > 0
                  ? 'bg-emerald-50/90 border-emerald-400 shadow-sm'
                  : gestureStatus === 'single_hand_detected'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : gestureStatus === 'low_visibility_or_out_of_frame'
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {gestureProgress > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-200/50 transition-all duration-75 pointer-events-none"
                  style={{ width: `${Math.round(gestureProgress * 100)}%` }}
                />
              )}

              <div className="relative z-10 flex items-center justify-center gap-2 text-xs font-bold">
                <span className={`text-xl ${gestureProgress > 0 ? 'animate-pulse' : ''}`}>
                  {gestureStatus === 'holding'
                    ? '⏳'
                    : gestureStatus === 'single_hand_detected'
                      ? '🙋'
                      : gestureStatus === 'low_visibility_or_out_of_frame'
                        ? '📐'
                        : gestureStatus === 'confirmed'
                          ? '✅'
                          : '🙌'}
                </span>
                <span className="leading-snug text-center">{gestureMessage}</span>
              </div>
            </div>

            {/* Clinical Accessibility Fallback */}
            {showAccessibilityFallbackHint && (
              <div className="mb-3 p-3 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-900 text-xs font-medium text-left flex items-start gap-2 animate-fade-in shadow-xs">
                <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
                <span className="leading-relaxed">
                  หากยกมือไม่สะดวก กดปุ่มสีเขียวด้านล่างเพื่อเริ่มได้ทันที (ไม่จำเป็นต้องฝืนยกแขน)
                </span>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-3">
              <button
                type="button"
                id="kiosk-confirm-ready-btn"
                data-testid="kiosk-confirm-ready-btn"
                onClick={handleManualConfirm}
                className="touch-btn relative overflow-hidden w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99] transition select-none"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-400/40 backdrop-brightness-110 pointer-events-none transition-all duration-100 ease-out"
                  style={{ width: `${Math.round(gestureProgress * 100)}%` }}
                />

                {gestureProgress > 0 ? (
                  <div className="relative z-10 flex items-center gap-2">
                    <svg className="w-5 h-5 -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-emerald-800/40"
                        strokeWidth="4"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-white transition-all duration-75"
                        strokeDasharray={`${Math.round(gestureProgress * 100)}, 100`}
                        strokeWidth="4"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span>ค้างไว้อีกนิด... ({Math.round(gestureProgress * 100)}%)</span>
                  </div>
                ) : (
                  <span className="relative z-10 flex items-center gap-2">
                    <span>👐 ยก 2 มือขึ้น หรือ กดที่นี่เพื่อเริ่มฝึก ➔</span>
                  </span>
                )}
              </button>

              <button
                type="button"
                id="kiosk-reset-scan-btn"
                data-testid="kiosk-reset-scan-btn"
                onClick={handleResetScan}
                className="text-xs text-slate-500 hover:text-slate-700 underline py-1 transition cursor-pointer"
              >
                ไม่ใช่ฉัน (สแกนใหม่)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unrecognized Face Alert with 4 Action Buttons */}
      {unrecognizedAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border-2 border-rose-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              {lang === 'zh-CN' ? '未找到系统账户' : lang === 'en-US' ? 'Account Not Found' : 'ไม่พบบัญชีในระบบ'}
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {unrecognizedAlert}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setUnrecognizedAlert(null);
                  handleResetScan();
                  if (faceInCircle) {
                    startCountdown();
                  }
                }}
                className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'zh-CN' ? '🔄 重试' : lang === 'en-US' ? '🔄 Retry' : '🔄 ลองอีกครั้ง'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnrecognizedAlert(null);
                  setEnteredPin('');
                  setIsPinModalOpen(true);
                }}
                className="py-3 px-3 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span>{lang === 'zh-CN' ? '🔑 PIN码' : lang === 'en-US' ? '🔑 4-digit PIN' : '🔑 ใช้รหัส PIN'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnrecognizedAlert(null);
                  if (onOpenNewPatientModal) {
                    onOpenNewPatientModal();
                  } else {
                    onNavigateToEnroll();
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs hover:bg-blue-100 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                <span>{lang === 'zh-CN' ? '➕ 注册新患者' : lang === 'en-US' ? '➕ Register' : '➕ สมัครคนไข้ใหม่'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnrecognizedAlert(null);
                  setStatusText(
                    lang === 'zh-CN'
                      ? '📞 请前往1号前台联系工作人员'
                      : lang === 'en-US'
                      ? '📞 Please contact staff at Counter 1'
                      : '📞 กรุณาติดต่อเจ้าหน้าที่เวชระเบียนที่เคาน์เตอร์ 1'
                  );
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <PhoneCall className="w-3.5 h-3.5 text-slate-500" />
                <span>{lang === 'zh-CN' ? '📞 联系工作人员' : lang === 'en-US' ? '📞 Call Staff' : '📞 ติดต่อเจ้าหน้าที่'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: About System */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-emerald-500/30 p-6 text-center shadow-2xl relative animate-scale-up">
            <button
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              🏥
            </div>
            <h3 className="text-lg font-bold text-slate-800">เกี่ยวกับระบบ Dr.Tech.Care</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enterprise Hospital Physical Therapy Platform v6.0</p>

            <div className="space-y-2 mt-4 text-left">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🟢</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">3-Second Countdown & Median Aggregator</div>
                  <div className="text-[11px] text-slate-500">เก็บตัวอย่างทุก 250ms คำนวณ Median Score ด้วยเกณฑ์ &gt;= 80% และสำรองด้วย PIN 4 หลัก</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🛡️</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">3D Depth & Active Liveness Guard</div>
                  <div className="text-[11px] text-slate-500">ระบบตรวจสอบความมีชีวิต ป้องกันภาพถ่าย วิดีโอ และการสวมรอย</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-lg">🙌</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">Touchless Clinical Gesture Readiness</div>
                  <div className="text-[11px] text-slate-500">ยืนยันความพร้อมด้วยการยกมือทั้งสองข้างแบบไร้สัมผัส</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
