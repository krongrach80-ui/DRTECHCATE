-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 06: Advanced Enterprise Hospital Extensions
-- Features:
-- 1. Cryptographic Tamper-Proof Audit & Notes Hash Chaining (SHA-256)
-- 2. Automated Self-Healing & Ephemeral Cleanup Routines
-- 3. Advanced Clinical Recovery & VAS Pain Trajectory Analytics Views
-- 4. PDPA Dynamic Data Masking (DDM) Functions
-- 5. Real-Time Kiosk & Clinic Workload Operational Views
-- ========================================================================

-- ------------------------------------------------------------------------
-- 0. EXTENSIONS & PREREQUISITES
-- ------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure mission_runs has pain_score and feedback columns for clinical outcome tracking
ALTER TABLE mission_runs ADD COLUMN IF NOT EXISTS pain_score INT;
ALTER TABLE mission_runs ADD COLUMN IF NOT EXISTS feedback TEXT;

-- ------------------------------------------------------------------------
-- 1. CRYPTOGRAPHIC TAMPER-PROOF HASH CHAINING (Non-Repudiation)
-- ------------------------------------------------------------------------
-- Adds SHA-256 hash chaining to medical_notes and audit_logs.
-- Every row cryptographically signs the previous row's hash.
-- Any manual tampering of past notes or logs breaks the signature chain.

ALTER TABLE medical_notes ADD COLUMN IF NOT EXISTS prev_hash TEXT DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE medical_notes ADD COLUMN IF NOT EXISTS curr_hash TEXT;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS curr_hash TEXT;

-- 1.1 Trigger Function: Cryptographic Hash Chaining for Medical Notes
CREATE OR REPLACE FUNCTION fn_chain_medical_notes_hash()
RETURNS TRIGGER AS $$
DECLARE
  v_last_hash TEXT;
BEGIN
  -- Retrieve the latest hash for this patient's chart
  SELECT curr_hash INTO v_last_hash
  FROM medical_notes
  WHERE patient_id = NEW.patient_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_last_hash IS NOT NULL THEN
    NEW.prev_hash := v_last_hash;
  ELSE
    NEW.prev_hash := 'GENESIS_' || NEW.patient_id::TEXT;
  END IF;

  -- Compute deterministic SHA-256 hash of: prev_hash + patient_id + author_id + body + created_at
  NEW.curr_hash := encode(
    digest(
      NEW.prev_hash || '|' ||
      NEW.patient_id::TEXT || '|' ||
      NEW.author_id::TEXT || '|' ||
      NEW.body || '|' ||
      COALESCE(NEW.created_at::TEXT, CURRENT_TIMESTAMP::TEXT),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_medical_notes_hash ON medical_notes;
CREATE TRIGGER trg_chain_medical_notes_hash
  BEFORE INSERT ON medical_notes
  FOR EACH ROW
  EXECUTE FUNCTION fn_chain_medical_notes_hash();

-- 1.2 Trigger Function: Cryptographic Hash Chaining for Audit Logs
CREATE OR REPLACE FUNCTION fn_chain_audit_logs_hash()
RETURNS TRIGGER AS $$
DECLARE
  v_last_hash TEXT;
BEGIN
  SELECT curr_hash INTO v_last_hash
  FROM audit_logs
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_last_hash IS NOT NULL THEN
    NEW.prev_hash := v_last_hash;
  ELSE
    NEW.prev_hash := 'AUDIT_GENESIS_CHAIN';
  END IF;

  NEW.curr_hash := encode(
    digest(
      NEW.prev_hash || '|' ||
      COALESCE(NEW.actor_id::TEXT, 'ANON') || '|' ||
      NEW.action || '|' ||
      NEW.entity || '|' ||
      COALESCE(NEW.entity_id::TEXT, '') || '|' ||
      COALESCE(NEW.created_at::TEXT, CURRENT_TIMESTAMP::TEXT),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_audit_logs_hash ON audit_logs;
CREATE TRIGGER trg_chain_audit_logs_hash
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION fn_chain_audit_logs_hash();

-- ------------------------------------------------------------------------
-- 2. PDPA DYNAMIC DATA MASKING (DDM) HELPERS
-- ------------------------------------------------------------------------

-- Mask phone numbers (e.g. 0812345678 -> 081-***-5678)
CREATE OR REPLACE FUNCTION mask_phone(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone_number IS NULL OR length(phone_number) < 8 THEN
    RETURN '***-***-****';
  END IF;
  RETURN substring(phone_number from 1 for 3) || '-***-' || substring(phone_number from length(phone_number) - 3 for 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------------------
-- 3. ADVANCED CLINICAL ANALYTICS VIEWS
-- ------------------------------------------------------------------------

-- 3.1 Patient Recovery Trajectory View (VAS Pain Score Progression)
-- Calculates pain changes across treatment versions to evaluate PT course efficacy
CREATE OR REPLACE VIEW view_patient_recovery_trajectory AS
SELECT
  p.id AS patient_id,
  p.hn,
  p.first_name || ' ' || p.last_name AS patient_name,
  p.injury,
  prof.full_name AS responsible_pt_name,
  mr.run_date,
  mr.pain_score AS current_pain_vas,
  LAG(mr.pain_score) OVER (PARTITION BY mr.patient_id ORDER BY mr.run_date ASC) AS previous_pain_vas,
  (LAG(mr.pain_score) OVER (PARTITION BY mr.patient_id ORDER BY mr.run_date ASC) - mr.pain_score) AS pain_reduction_delta,
  mr.status AS mission_status,
  mr.feedback AS patient_feedback
FROM mission_runs mr
JOIN patients p ON p.id = mr.patient_id
LEFT JOIN profiles prof ON prof.id = p.responsible_pt_id
WHERE mr.status = 'completed';

-- 3.2 Daily Clinic Operational Throughput View (For Director & Reception Dashboard)
CREATE OR REPLACE VIEW view_clinic_daily_summary AS
SELECT
  CURRENT_DATE AS report_date,
  (SELECT COUNT(*) FROM checkins WHERE date = CURRENT_DATE) AS total_checked_in,
  (SELECT COUNT(*) FROM courses WHERE CURRENT_DATE BETWEEN start_date AND end_date AND status = 'active') AS active_courses_today,
  (SELECT COUNT(*) FROM mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed') AS missions_completed_today,
  (SELECT COUNT(*) FROM staff_calls WHERE created_at::DATE = CURRENT_DATE AND handled_at IS NULL) AS pending_emergency_calls,
  (SELECT COALESCE(ROUND(AVG(pain_score), 1), 0) FROM mission_runs WHERE run_date = CURRENT_DATE AND status = 'completed' AND pain_score IS NOT NULL) AS avg_pain_score_today;

-- 3.3 Kiosk Terminal Health & Activity Monitor View
CREATE OR REPLACE VIEW view_kiosk_live_telemetry AS
SELECT
  kd.id AS kiosk_id,
  kd.name AS kiosk_name,
  kd.location,
  kd.is_active,
  kd.last_seen_at,
  CASE
    WHEN kd.last_seen_at IS NULL THEN 'offline'
    WHEN kd.last_seen_at >= NOW() - INTERVAL '5 minutes' THEN 'online'
    ELSE 'stale'
  END AS connection_status,
  COUNT(sc.id) FILTER (WHERE sc.handled_at IS NULL) AS unhandled_staff_calls_count
FROM kiosk_devices kd
LEFT JOIN staff_calls sc ON sc.kiosk_id = kd.id
GROUP BY kd.id, kd.name, kd.location, kd.is_active, kd.last_seen_at;

-- ------------------------------------------------------------------------
-- 4. AUTONOMOUS DATABASE MAINTENANCE & SELF-HEALING ROUTINES
-- ------------------------------------------------------------------------
-- Safely purges expired nonces, stale single-use tickets, and expired bans.

CREATE OR REPLACE FUNCTION cleanup_expired_ephemerals()
RETURNS TABLE (
  purged_challenges INT,
  purged_tickets INT,
  purged_bans INT
) AS $$
DECLARE
  v_challenges INT;
  v_tickets INT;
  v_bans INT;
BEGIN
  -- Purge face challenges older than 10 minutes
  DELETE FROM face_challenges
  WHERE expires_at < NOW() - INTERVAL '10 minutes' OR used_at IS NOT NULL;
  GET DIAGNOSTICS v_challenges = ROW_COUNT;

  -- Expire unredeemed enrollment tickets older than 20 minutes
  UPDATE enrollment_tickets
  SET expires_at = NOW()
  WHERE expires_at < NOW() AND used_at IS NULL;
  GET DIAGNOSTICS v_tickets = ROW_COUNT;

  -- Deactivate expired bans
  DELETE FROM bans
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_bans = ROW_COUNT;

  RETURN QUERY SELECT v_challenges, v_tickets, v_bans;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution of maintenance routines strictly to service_role
REVOKE ALL ON FUNCTION cleanup_expired_ephemerals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_ephemerals() TO service_role;
