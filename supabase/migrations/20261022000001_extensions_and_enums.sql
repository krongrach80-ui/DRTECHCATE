-- ========================================================================
-- DrTech.Care Physical Therapy System
-- Migration 01: Extensions, Enums, Sequences
-- ========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('admin', 'pt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE staff_status AS ENUM ('active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE patient_registration_status AS ENUM (
    'awaiting_face',
    'face_enrolled',
    'active',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE patient_registered_via AS ENUM ('reception', 'kiosk');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE face_pose AS ENUM ('front', 'left', 'right', 'nod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE face_enrollment_status AS ENUM ('pending', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE course_status AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE mission_status AS ENUM ('pending', 'in_progress', 'completed', 'missed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE mission_step_type AS ENUM ('physio', 'minigame');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE case_transfer_status AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ban_type AS ENUM ('ip', 'device', 'account');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. SEQUENCE FOR HOSPITAL NUMBER (HN)
-- Locked Decision #5: HN must be issued from a database sequence (never random or timestamp)
CREATE SEQUENCE IF NOT EXISTS patient_hn_seq START WITH 100001 INCREMENT BY 1;
