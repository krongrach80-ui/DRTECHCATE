-- 20261025000001_smart_onboarding.sql
-- Master Prompt v4: Sovereign Isolated Medical-Grade Architecture
-- Non-breaking extension: Add face_registered_pending_info enum value

ALTER TYPE public.patient_reg_status ADD VALUE IF NOT EXISTS 'face_registered_pending_info';

