import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isPathAllowedForRole, getRedirectPathForRole } from '@/lib/rbac/roles';

describe('Database Schema & Migration Validation', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');

  it('contains all 3 structured migration files', () => {
    const files = fs.readdirSync(migrationsDir);
    expect(files).toContain('20261022000001_initial_schema.sql');
    expect(files).toContain('20261022000002_rls_and_policies.sql');
    expect(files).toContain('20261022000003_storage_buckets.sql');
  });

  it('defines pgvector extension and all 15 required tables in migration 1', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '20261022000001_initial_schema.sql'), 'utf8');

    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector;');
    
    const tables = [
      'profiles',
      'patients',
      'pts',
      'patient_pt_assignments',
      'case_transfers',
      'exercises',
      'courses',
      'course_items',
      'medical_notes',
      'consents',
      'face_enrollments',
      'face_templates',
      'kiosk_devices',
      'audit_logs',
      'banned_ips',
    ];

    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    // Verify 128-dim vector column
    expect(sql).toContain('vector(128)');

    // Verify immutability triggers
    expect(sql).toContain('prevent_medical_notes_modification');
    expect(sql).toContain('prevent_audit_logs_modification');
  });

  it('enforces RLS on all 15 tables and defines security definer helper functions in migration 2', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '20261022000002_rls_and_policies.sql'), 'utf8');

    const tables = [
      'profiles',
      'patients',
      'pts',
      'patient_pt_assignments',
      'case_transfers',
      'exercises',
      'courses',
      'course_items',
      'medical_notes',
      'consents',
      'face_enrollments',
      'face_templates',
      'kiosk_devices',
      'audit_logs',
      'banned_ips',
    ];

    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }

    // Security definer functions
    expect(sql).toContain('current_user_role()');
    expect(sql).toContain('is_patient_accessible_by_pt(p_patient_id UUID)');
    expect(sql).toContain('find_matching_face(');
    expect(sql).toContain('validate_course_item_exercise_type()');

    // Medical notes append-only check: No update or delete policies
    expect(sql).not.toContain('FOR UPDATE ON medical_notes');
    expect(sql).not.toContain('FOR DELETE ON medical_notes');
  });

  it('defines 3 private/protected storage buckets and policies in migration 3', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '20261022000003_storage_buckets.sql'), 'utf8');

    expect(sql).toContain("'avatars'");
    expect(sql).toContain("'biometric-data'");
    expect(sql).toContain("'exercise-media'");

    // Biometric data has no public policy
    expect(sql).not.toContain('CREATE POLICY "biometric_data_public"');
  });
});

describe('RBAC Route Protection Logic', () => {
  it('correctly maps default home paths per role', () => {
    expect(getRedirectPathForRole('admin')).toBe('/admin');
    expect(getRedirectPathForRole('pt')).toBe('/pt');
    expect(getRedirectPathForRole('patient')).toBe('/me');
  });

  it('strictly isolates routes based on user role', () => {
    // Admin can access admin routes, but not PT or patient specific
    expect(isPathAllowedForRole('admin', '/admin')).toBe(true);
    expect(isPathAllowedForRole('admin', '/admin/users')).toBe(true);
    expect(isPathAllowedForRole('pt', '/admin')).toBe(false);
    expect(isPathAllowedForRole('patient', '/admin')).toBe(false);

    // PT routes
    expect(isPathAllowedForRole('pt', '/pt')).toBe(true);
    expect(isPathAllowedForRole('pt', '/pt/patients')).toBe(true);
    expect(isPathAllowedForRole('admin', '/pt')).toBe(false);
    expect(isPathAllowedForRole('patient', '/pt')).toBe(false);

    // Patient routes
    expect(isPathAllowedForRole('patient', '/me')).toBe(true);
    expect(isPathAllowedForRole('pt', '/me')).toBe(false);
    expect(isPathAllowedForRole('admin', '/me')).toBe(false);
  });
});
