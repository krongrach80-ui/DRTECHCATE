-- =========================================================================
-- Migration: 20261030000001_exercise_detection_config.sql
-- Description: Dynamic AI Biomechanical Detection Engine schema updates
-- 1. Adds detection_config JSONB to exercises
-- 2. Adds custom_detection_config JSONB to course_items
-- 3. Creates exercise_session_logs table for AI telemetry & safety compliance
-- 4. Seeds Shoulder Pendulum (and core exercises) with detection_config
-- =========================================================================

-- 1. Add detection_config to public.exercises
ALTER TABLE IF EXISTS public.exercises
  ADD COLUMN IF NOT EXISTS detection_config JSONB DEFAULT NULL;

-- 2. Add custom_detection_config to public.course_items for per-patient overrides
ALTER TABLE IF EXISTS public.course_items
  ADD COLUMN IF NOT EXISTS custom_detection_config JSONB DEFAULT NULL;

-- 3. Create exercise_session_logs table for AI telemetry and clinical tracking
CREATE TABLE IF NOT EXISTS public.exercise_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE SET NULL,
  kiosk_id VARCHAR(50) DEFAULT 'kiosk-01',
  completion_mode VARCHAR(50) NOT NULL DEFAULT 'ai_verified' 
    CHECK (completion_mode IN ('ai_verified', 'skipped_unverified', 'stopped_pain')),
  correct_reps INTEGER DEFAULT 0,
  incorrect_reps INTEGER DEFAULT 0,
  target_reps INTEGER DEFAULT 10,
  current_set INTEGER DEFAULT 1,
  total_sets INTEGER DEFAULT 3,
  max_angle_achieved NUMERIC(6,2) DEFAULT NULL,
  consistency_score NUMERIC(5,2) DEFAULT NULL,
  pain_reported BOOLEAN DEFAULT FALSE,
  duration_seconds NUMERIC(8,2) DEFAULT NULL,
  telemetry_summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for clinical auditing and analytics
CREATE INDEX IF NOT EXISTS idx_exercise_session_logs_patient ON public.exercise_session_logs (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_session_logs_exercise ON public.exercise_session_logs (exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_session_logs_mode ON public.exercise_session_logs (completion_mode);

-- 4. Enable RLS and setup permissive policies for service role and authenticated staff
ALTER TABLE public.exercise_session_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exercise_session_logs' AND policyname = 'service_role_all_session_logs'
  ) THEN
    CREATE POLICY service_role_all_session_logs ON public.exercise_session_logs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exercise_session_logs' AND policyname = 'authenticated_staff_read_session_logs'
  ) THEN
    CREATE POLICY authenticated_staff_read_session_logs ON public.exercise_session_logs
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exercise_session_logs' AND policyname = 'authenticated_staff_insert_session_logs'
  ) THEN
    CREATE POLICY authenticated_staff_insert_session_logs ON public.exercise_session_logs
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- 5. Seed Shoulder Pendulum detection_config in public.exercises
UPDATE public.exercises
SET detection_config = '{
  "id": "ex-shoulder-pendulum",
  "exerciseId": "e1000000-0000-0000-0000-000000000001",
  "nameTh": "Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)",
  "nameEn": "Codman Shoulder Pendulum",
  "description": "โน้มลำตัวไปข้างหน้า ปล่อยแขนห้อยลงตามแรงโน้มถ่วง และแกว่งเป็นวงกลมเบาๆ เพื่อผ่อนคลายข้อต่อและเพิ่มการไหลเวียนเลือด",
  "mediaUrl": "/assets/exercises/shoulder_pendulum.mp4",
  "evaluationMode": "pendulum_circular",
  "side": "right",
  "targetJoint": "shoulder",
  "cameraGuide": {
    "recommendedView": "side_45",
    "recommendedDistanceMeters": [1.5, 2.5],
    "instructionTextTh": "กรุณายืนหันข้างเฉียง 45° ถึง 90° ระยะห่าง 1.5 - 2.5 เมตรจากกล้อง โน้มตัวไปข้างหน้าเล็กน้อย และปล่อยแขนข้างที่ต้องการฝึกให้ห้อยลงอย่างผ่อนคลาย"
  },
  "pendulumMechanics": {
    "minTrunkForwardTiltDeg": 18.0,
    "maxTrunkForwardTiltDeg": 65.0,
    "minElbowStraightnessDeg": 145.0,
    "minCircleRadiusRatio": 0.07,
    "maxCircleRadiusRatio": 0.35,
    "minCycleDurationSec": 1.2,
    "maxCycleDurationSec": 5.0
  },
  "defaultPrescription": {
    "repsPerSet": 10,
    "totalSets": 3,
    "restBetweenSetsSec": 30
  },
  "compensationRules": [
    {
      "ruleId": "pendulum_trunk_lean",
      "type": "trunk_lean",
      "thresholdValue": 0.25,
      "warningMessageTh": "ลำตัวเอียงหรือไม่นิ่ง โน้มตัวให้มั่นคงและปล่อยให้แขนแกว่งเป็นอิสระ",
      "severity": "warning"
    },
    {
      "ruleId": "pendulum_elbow_flexion",
      "type": "elbow_flexion",
      "thresholdValue": 140.0,
      "warningMessageTh": "ปล่อยแขนให้ตรง อย่าเกร็งหรืองอข้อศอกขณะแกว่ง",
      "severity": "warning"
    },
    {
      "ruleId": "pendulum_speed",
      "type": "excessive_speed",
      "thresholdValue": 240.0,
      "warningMessageTh": "แกว่งแขนเร็วเกินไป ค่อยๆ แกว่งช้าๆ เพื่อผ่อนคลายข้อไหล่",
      "severity": "warning"
    }
  ],
  "safetyContraindications": {
    "stopOnPainMessageTh": "หากมีอาการเจ็บแปลบบริเวณข้อไหล่หรือแขน ให้หยุดทันทีและแจ้งนักกายภาพบำบัด",
    "maxSafeAngleCapDeg": 90
  }
}'::jsonb
WHERE title ILIKE '%Shoulder Pendulum%' OR title ILIKE '%แกว่งแขน%';

-- Also seed for any UUID match
UPDATE public.exercises
SET detection_config = '{
  "id": "ex-shoulder-pendulum",
  "exerciseId": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  "nameTh": "Shoulder Pendulum (แกว่งแขนวงกลมผ่อนคลายหัวไหล่)",
  "nameEn": "Codman Shoulder Pendulum",
  "description": "โน้มลำตัวไปข้างหน้า ปล่อยแขนห้อยลงตามแรงโน้มถ่วง และแกว่งเป็นวงกลมเบาๆ เพื่อผ่อนคลายข้อต่อและเพิ่มการไหลเวียนเลือด",
  "mediaUrl": "/assets/exercises/shoulder_pendulum.mp4",
  "evaluationMode": "pendulum_circular",
  "side": "right",
  "targetJoint": "shoulder",
  "cameraGuide": {
    "recommendedView": "side_45",
    "recommendedDistanceMeters": [1.5, 2.5],
    "instructionTextTh": "กรุณายืนหันข้างเฉียง 45° ถึง 90° ระยะห่าง 1.5 - 2.5 เมตรจากกล้อง โน้มตัวไปข้างหน้าเล็กน้อย และปล่อยแขนข้างที่ต้องการฝึกให้ห้อยลงอย่างผ่อนคลาย"
  },
  "pendulumMechanics": {
    "minTrunkForwardTiltDeg": 18.0,
    "maxTrunkForwardTiltDeg": 65.0,
    "minElbowStraightnessDeg": 145.0,
    "minCircleRadiusRatio": 0.07,
    "maxCircleRadiusRatio": 0.35,
    "minCycleDurationSec": 1.2,
    "maxCycleDurationSec": 5.0
  },
  "defaultPrescription": {
    "repsPerSet": 10,
    "totalSets": 3,
    "restBetweenSetsSec": 30
  },
  "compensationRules": [
    {
      "ruleId": "pendulum_trunk_lean",
      "type": "trunk_lean",
      "thresholdValue": 0.25,
      "warningMessageTh": "ลำตัวเอียงหรือไม่นิ่ง โน้มตัวให้มั่นคงและปล่อยให้แขนแกว่งเป็นอิสระ",
      "severity": "warning"
    },
    {
      "ruleId": "pendulum_elbow_flexion",
      "type": "elbow_flexion",
      "thresholdValue": 140.0,
      "warningMessageTh": "ปล่อยแขนให้ตรง อย่าเกร็งหรืองอข้อศอกขณะแกว่ง",
      "severity": "warning"
    },
    {
      "ruleId": "pendulum_speed",
      "type": "excessive_speed",
      "thresholdValue": 240.0,
      "warningMessageTh": "แกว่งแขนเร็วเกินไป ค่อยๆ แกว่งช้าๆ เพื่อผ่อนคลายข้อไหล่",
      "severity": "warning"
    }
  ],
  "safetyContraindications": {
    "stopOnPainMessageTh": "หากมีอาการเจ็บแปลบบริเวณข้อไหล่หรือแขน ให้หยุดทันทีและแจ้งนักกายภาพบำบัด",
    "maxSafeAngleCapDeg": 90
  }
}'::jsonb
WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' OR id = 'e1000000-0000-0000-0000-000000000001';
