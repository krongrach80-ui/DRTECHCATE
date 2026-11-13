-- Migration: Additive enhancement to staff_calls for Dr.Tech.Care
-- Purpose: Add source tracking, failure count, and unique partial index to prevent duplicate pending calls

-- 1. Add source tracking and failed attempts (Additive only)
ALTER TABLE public.staff_calls 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual_button' 
  CHECK (source IN ('manual_button', 'failed_scan_limit', 'system_error'));

ALTER TABLE public.staff_calls 
  ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;

-- 2. Prevent duplicate pending calls per kiosk at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_calls_kiosk_pending 
  ON public.staff_calls (kiosk_id) 
  WHERE (handled_at IS NULL);

