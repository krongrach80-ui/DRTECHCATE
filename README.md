# DRTECHCARE

Hospital Physical Therapy Management & Face-Recognition Kiosk System (ระบบกายภาพบำบัดโรงพยาบาล)

## Architecture Overview (Master Prompt v3)

DrTech.Care is a decoupled physical therapy system designed for hospitals, featuring:
- **Express 5 API Server** (`apps/api`): Clean REST API with strict Supabase service-role backend connection.
- **Admin Dashboard** (`apps/admin`): Clinic management, PT roster, course & exercise templates, device management, audit logs.
- **PT Clinical Portal** (`apps/pt`): Patient assignment, clinical notes (append-only), exercise prescriptions, case transfers.
- **Check-in Kiosk** (`apps/kiosk`): Biometric face verification with challenge-response liveness detection, telephone keypad backup, thermal queue ticket printing.
- **Database Architecture** (`supabase/migrations`): 27 PostgreSQL tables with Row Level Security (RLS), append-only triggers on clinical/audit records, `pgvector` HNSW cosine similarity search on 512-dim face embeddings, and zero public/anon privileges.

## Database Migrations

- `supabase/migrations/20261022000001_extensions_and_enums.sql`: Vector, UUID, pg_trgm extensions, enums, HN sequence.
- `supabase/migrations/20261022000002_core_schema.sql`: 27 relational tables with HNSW & GIN indexes.
- `supabase/migrations/20261022000003_triggers_and_invariants.sql`: Append-only triggers & business logic constraints.
- `supabase/migrations/20261022000004_rls_and_policies.sql`: Default privilege revoking & comprehensive RLS policies.
- `supabase/migrations/20261022000005_storage_and_biometrics.sql`: Private storage buckets & `match_face_candidates` RPC.

## Security & Privacy Invariants

1. **Zero Anon Privileges**: Anon role has 0 table access and 0 RPC execution privileges.
2. **Append-Only Clinical History**: `medical_notes`, `treatment_results`, and `audit_logs` cannot be updated or deleted.
3. **Biometric Protection**: Biometric embeddings and face matching RPC are accessible exclusively via backend `service_role`.
4. **Decoupled Patients**: Patient records are independent of `auth.users` to prevent identity provider lock-in.

## Documentation

- Architecture Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Legacy Security Audit: [`docs/LEGACY_AUDIT.md`](docs/LEGACY_AUDIT.md)
