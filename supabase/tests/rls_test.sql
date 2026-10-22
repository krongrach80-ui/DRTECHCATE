-- ========================================================================
-- DrTech.Care Physical Therapy System
-- pgTAP Test Suite: RLS, Security Policies, Immutability & Triggers
-- ========================================================================

BEGIN;
SELECT plan(76);

-- 1. EXTENSIONS
SELECT has_extension('uuid-ossp', 'Extension uuid-ossp must be installed');
SELECT has_extension('vector', 'Extension vector (pgvector) must be installed');
SELECT has_extension('pg_trgm', 'Extension pg_trgm must be installed');

-- 2. ALL 27 TABLES EXISTENCE
SELECT has_table('profiles', 'Table profiles must exist');
SELECT has_table('pts', 'Table pts must exist');
SELECT has_table('patients', 'Table patients must exist');
SELECT has_table('patient_pt_assignments', 'Table patient_pt_assignments must exist');
SELECT has_table('case_transfers', 'Table case_transfers must exist');
SELECT has_table('exercises', 'Table exercises must exist');
SELECT has_table('minigames', 'Table minigames must exist');
SELECT has_table('minigame_questions', 'Table minigame_questions must exist');
SELECT has_table('modpacks', 'Table modpacks must exist');
SELECT has_table('modpack_items', 'Table modpack_items must exist');
SELECT has_table('courses', 'Table courses must exist');
SELECT has_table('course_items', 'Table course_items must exist');
SELECT has_table('mission_runs', 'Table mission_runs must exist');
SELECT has_table('mission_steps', 'Table mission_steps must exist');
SELECT has_table('medical_notes', 'Table medical_notes must exist');
SELECT has_table('treatment_results', 'Table treatment_results must exist');
SELECT has_table('consents', 'Table consents must exist');
SELECT has_table('face_enrollments', 'Table face_enrollments must exist');
SELECT has_table('face_templates', 'Table face_templates must exist');
SELECT has_table('face_challenges', 'Table face_challenges must exist');
SELECT has_table('enrollment_tickets', 'Table enrollment_tickets must exist');
SELECT has_table('checkins', 'Table checkins must exist');
SELECT has_table('kiosk_devices', 'Table kiosk_devices must exist');
SELECT has_table('staff_devices', 'Table staff_devices must exist');
SELECT has_table('staff_calls', 'Table staff_calls must exist');
SELECT has_table('bans', 'Table bans must exist');
SELECT has_table('audit_logs', 'Table audit_logs must exist');

-- 3. SEQUENCE TEST
SELECT has_sequence('patient_hn_seq', 'Sequence patient_hn_seq must exist');

-- 4. FUNCTION EXISTENCE
SELECT has_function('match_face_candidates', ARRAY['vector[]', 'uuid[]', 'integer'], 'Function match_face_candidates must exist');
SELECT has_function('current_user_role', 'Function current_user_role must exist');
SELECT has_function('is_patient_accessible_by_pt', ARRAY['uuid'], 'Function is_patient_accessible_by_pt must exist');

-- 5. FUNCTION PRIVILEGE CHECKS (has_function_privilege)
SELECT ok(
  NOT has_function_privilege('public', 'match_face_candidates(vector[], uuid[], integer)', 'EXECUTE'),
  'Role public must NOT have EXECUTE privilege on match_face_candidates'
);
SELECT ok(
  NOT has_function_privilege('anon', 'match_face_candidates(vector[], uuid[], integer)', 'EXECUTE'),
  'Role anon must NOT have EXECUTE privilege on match_face_candidates'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'match_face_candidates(vector[], uuid[], integer)', 'EXECUTE'),
  'Role authenticated must NOT have EXECUTE privilege on match_face_candidates'
);
SELECT ok(
  has_function_privilege('service_role', 'match_face_candidates(vector[], uuid[], integer)', 'EXECUTE'),
  'Role service_role must have EXECUTE privilege on match_face_candidates'
);

-- Helper functions must NOT be callable by anon
SELECT ok(
  NOT has_function_privilege('anon', 'current_user_role()', 'EXECUTE'),
  'Role anon must NOT have EXECUTE privilege on current_user_role'
);
SELECT ok(
  NOT has_function_privilege('anon', 'is_patient_accessible_by_pt(uuid)', 'EXECUTE'),
  'Role anon must NOT have EXECUTE privilege on is_patient_accessible_by_pt'
);

-- 6. TABLE PRIVILEGE CHECKS FOR ANON (has_table_privilege) - Zero permissions
SELECT ok(NOT has_table_privilege('anon', 'profiles', 'SELECT'), 'anon cannot SELECT profiles');
SELECT ok(NOT has_table_privilege('anon', 'patients', 'SELECT'), 'anon cannot SELECT patients');
SELECT ok(NOT has_table_privilege('anon', 'patient_pt_assignments', 'SELECT'), 'anon cannot SELECT patient_pt_assignments');
SELECT ok(NOT has_table_privilege('anon', 'case_transfers', 'SELECT'), 'anon cannot SELECT case_transfers');
SELECT ok(NOT has_table_privilege('anon', 'exercises', 'SELECT'), 'anon cannot SELECT exercises');
SELECT ok(NOT has_table_privilege('anon', 'minigames', 'SELECT'), 'anon cannot SELECT minigames');
SELECT ok(NOT has_table_privilege('anon', 'courses', 'SELECT'), 'anon cannot SELECT courses');
SELECT ok(NOT has_table_privilege('anon', 'course_items', 'SELECT'), 'anon cannot SELECT course_items');
SELECT ok(NOT has_table_privilege('anon', 'medical_notes', 'SELECT'), 'anon cannot SELECT medical_notes');
SELECT ok(NOT has_table_privilege('anon', 'treatment_results', 'SELECT'), 'anon cannot SELECT treatment_results');
SELECT ok(NOT has_table_privilege('anon', 'consents', 'SELECT'), 'anon cannot SELECT consents');
SELECT ok(NOT has_table_privilege('anon', 'face_enrollments', 'SELECT'), 'anon cannot SELECT face_enrollments');
SELECT ok(NOT has_table_privilege('anon', 'face_templates', 'SELECT'), 'anon cannot SELECT face_templates');
SELECT ok(NOT has_table_privilege('anon', 'face_challenges', 'SELECT'), 'anon cannot SELECT face_challenges');
SELECT ok(NOT has_table_privilege('anon', 'enrollment_tickets', 'SELECT'), 'anon cannot SELECT enrollment_tickets');
SELECT ok(NOT has_table_privilege('anon', 'checkins', 'SELECT'), 'anon cannot SELECT checkins');
SELECT ok(NOT has_table_privilege('anon', 'kiosk_devices', 'SELECT'), 'anon cannot SELECT kiosk_devices');
SELECT ok(NOT has_table_privilege('anon', 'staff_devices', 'SELECT'), 'anon cannot SELECT staff_devices');
SELECT ok(NOT has_table_privilege('anon', 'bans', 'SELECT'), 'anon cannot SELECT bans');
SELECT ok(NOT has_table_privilege('anon', 'audit_logs', 'SELECT'), 'anon cannot SELECT audit_logs');

-- 7. STRICTLY PRIVATE TABLES FOR AUTHENTICATED
-- Tables that MUST have zero client policies (service_role only)
SELECT ok(NOT has_table_privilege('authenticated', 'face_templates', 'SELECT'), 'authenticated cannot SELECT face_templates');
SELECT ok(NOT has_table_privilege('authenticated', 'face_challenges', 'SELECT'), 'authenticated cannot SELECT face_challenges');
SELECT ok(NOT has_table_privilege('authenticated', 'kiosk_devices', 'SELECT'), 'authenticated cannot SELECT kiosk_devices');
SELECT ok(NOT has_table_privilege('authenticated', 'staff_devices', 'SELECT'), 'authenticated cannot SELECT staff_devices');
SELECT ok(NOT has_table_privilege('authenticated', 'bans', 'SELECT'), 'authenticated cannot SELECT bans');

-- 8. IMMUTABILITY & INVARIANT TRIGGERS
SELECT has_trigger('medical_notes', 'trg_prevent_medical_notes_modification', 'Trigger on medical_notes must exist');
SELECT has_trigger('treatment_results', 'trg_prevent_treatment_results_modification', 'Trigger on treatment_results must exist');
SELECT has_trigger('audit_logs', 'trg_prevent_audit_logs_modification', 'Trigger on audit_logs must exist');
SELECT has_trigger('exercises', 'trg_enforce_exercise_ownership', 'Ownership trigger on exercises must exist');
SELECT has_trigger('minigames', 'trg_enforce_minigame_ownership', 'Ownership trigger on minigames must exist');
SELECT has_trigger('courses', 'trg_enforce_course_assignment_permission', 'Course prescription trigger on courses must exist');

-- 9. VECTOR 512 & HNSW INDEX
SELECT has_index('face_templates', 'idx_face_templates_hnsw_cosine', 'HNSW cosine index on face_templates must exist');
SELECT has_index('patients', 'idx_patients_trgm_name', 'GIN trigram index on patients name must exist');
SELECT has_index('patients', 'idx_patients_trgm_hn', 'GIN trigram index on patients hn must exist');

SELECT * FROM finish();
ROLLBACK;
