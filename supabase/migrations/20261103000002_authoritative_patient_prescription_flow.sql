-- 20261103000002_authoritative_patient_prescription_flow.sql
-- Master Prompt: Authoritative Patient Registration Draft Lifecycle & Course Prescription Flow

-- 1. เพิ่มค่า 'draft' ใน enum สถานะการลงทะเบียน (หากยังไม่มี)
DO $$ 
BEGIN 
  ALTER TYPE public.patient_registration_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'awaiting_face';
EXCEPTION 
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN 
  ALTER TYPE public.patient_reg_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'awaiting_face';
EXCEPTION 
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. เพิ่มคอลัมน์ข้อมูลทางคลินิก, PDPA, และ PIN Hash ในตาราง public.patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS target_joint TEXT DEFAULT 'ข้อไหล่',
  ADD COLUMN IF NOT EXISTS contraindications TEXT DEFAULT '-',
  ADD COLUMN IF NOT EXISTS underlying_diseases TEXT DEFAULT '-',
  ADD COLUMN IF NOT EXISTS allergies TEXT DEFAULT '-',
  ADD COLUMN IF NOT EXISTS doctor_notes TEXT DEFAULT '-',
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdpa_consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS registered_by_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS registered_by_staff_name TEXT;

-- 3. ตารางบันทึกความยินยอม PDPA (Biometric Consent Trail)
CREATE TABLE IF NOT EXISTS public.patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL DEFAULT 'face_biometric',
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consented_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ตารางใบสั่งจ่ายคอร์สกายภาพ (Exercise Prescriptions)
CREATE TABLE IF NOT EXISTS public.exercise_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  prescribed_by UUID REFERENCES public.profiles(id),
  target_joint TEXT NOT NULL,
  diagnosis TEXT,
  contraindications TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  scheduled_dates DATE[] DEFAULT ARRAY[]::DATE[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. ตารางรายการท่าฝึกในใบสั่งยา (Prescription Items)
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.exercise_prescriptions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  target_side TEXT NOT NULL DEFAULT 'right' CHECK (target_side IN ('right', 'left', 'bilateral')),
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  hold_seconds INTEGER NOT NULL DEFAULT 3,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  clinical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Indexes เพื่อความรวดเร็วในการ Query
CREATE INDEX IF NOT EXISTS idx_patients_status ON public.patients(registration_status);
CREATE INDEX IF NOT EXISTS idx_patient_consents_pid ON public.patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_pid ON public.exercise_prescriptions(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_prescription_items_rxid ON public.prescription_items(prescription_id, sequence_order);

-- 7. RLS Policies
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "patient_consents_policy" ON public.patient_consents
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "exercise_prescriptions_policy" ON public.exercise_prescriptions
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "prescription_items_policy" ON public.prescription_items
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

