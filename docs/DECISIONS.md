# Architecture Decision Records (ADR) - DrTech.Care System

## ADR-001: Single-Instance Deployment Topology & Ephemeral State Management

### Status
Accepted

### Context
The hospital physical therapy system manages physical kiosk terminals, patient identity verification via facial biometrics, physical therapy exercise regimens, and clinical audit records. The system requires high security, zero secret leakage, fail-closed database connectivity, and minimal infrastructure complexity for on-premise hospital or single VPS deployment.

### Decision
We adopt a **Single-Instance Deployment Topology** (Docker container / VPS instance) for the DrTech.Care Express API backend (Port 3001) behind a reverse proxy (Caddy / Nginx or Next.js gateway on Port 3000), connected to Supabase PostgreSQL.

### Ephemeral In-Memory State & Impact on Restart
To ensure sub-millisecond response times and avoid excessive database round-trips for high-frequency operations, certain short-lived states are maintained in-memory:

1. **`kioskSessions` (`Map<string, KioskSessionRecord>`)**:
   - **Purpose**: Holds authenticated patient kiosk sessions (TTL: 15 minutes) after face verification and identity confirmation.
   - **Impact on Server Restart**: Any active in-progress session at a kiosk is invalidated. The patient simply taps the screen and re-authenticates via face scan (approx. 2 seconds). No clinical records or patient data are lost.

2. **`failedFaceAttempts` (`Map<string, number>`)**:
   - **Purpose**: Tracks consecutive face verification failures per kiosk terminal to trigger staff assistance upon reaching 3 failures.
   - **Impact on Server Restart**: Lockout counter resets to 0. Does not cause security vulnerability since rate limits and IP failure limits are separately logged to database `audit_logs`.

3. **`bannedIps` & `bannedDevices` Cache (`Map<string, number | null>`)**:
   - **Purpose**: Fast-path in-memory lookup for IP/device blacklist to reject malicious requests before routing.
   - **Impact on Server Restart**: Zero data loss. During server boot, `syncBansFromDatabase()` automatically queries the Postgres `bans` table and hydrates the in-memory cache.

4. **`profileCache` (`Map<string, CachedProfile>`)**:
   - **Purpose**: Caches user profile data for up to 15 seconds to prevent hammering the database on every authenticated HTTP request.
   - **Impact on Server Restart**: Cache clears cleanly. Fresh profiles are retrieved directly from Supabase upon next request.

### Invariants Maintained
- All persistent clinical data (Patients, Courses, Exercises, Minigames, Treatment Results, Medical Notes, Audit Logs, Staff Profiles) are stored directly in Supabase PostgreSQL with Fail-Closed behavior (503 SERVICE_UNAVAILABLE if DB is unreachable).
- Zero in-memory persistence fallback for clinical data.
- Append-only immutability enforced at database trigger level.

---

## ADR-002: Strict Content Security Policy (CSP), WebAssembly ('wasm-unsafe-eval'), and Worker Blob Directives

### Status
Accepted

### Context
Client-side web applications (`admin`, `pt`, `kiosk`) operate in hospital clinics and must adhere to strict Content Security Policy (CSP) guidelines:
- Zero `'unsafe-inline'` in `script-src` and `style-src`.
- No arbitrary external CDNs or scripts allowed.
- However, client-side camera landmark detection and active PAD liveness verification use Google MediaPipe (`@mediapipe/tasks-vision`) and ONNX Runtime Web (`onnxruntime-web`), which execute WebAssembly (Wasm) modules and Web Workers for real-time video processing.

### Decision & Rationale
We enforce the following CSP directives via Helmet in `apps/api/src/app.ts` as well as reverse proxies (`nginx.conf`, `Caddyfile`):

```text
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
style-src 'self';
font-src 'self';
img-src 'self' data: blob: <STORAGE_HOST>;
connect-src 'self' <STORAGE_HOST>;
frame-ancestors 'none';
```

1. **`'wasm-unsafe-eval'` in `script-src`**:
   - **Rationale**: MediaPipe and ONNX compile WebAssembly modules just-in-time from local byte arrays. Under standard W3C CSP Level 3, compiling Wasm requires either `'unsafe-eval'` or `'wasm-unsafe-eval'`. By using `'wasm-unsafe-eval'`, we permit Wasm instantiation *without* permitting general JavaScript `eval()` strings or dynamic script injection, closing the cross-site scripting attack vector.
2. **`worker-src 'self' blob:`**:
   - **Rationale**: MediaPipe and ONNX offload landmark extraction to a Web Worker thread to prevent freezing the UI thread at 30-60 FPS. These libraries construct Workers inline via `URL.createObjectURL(new Blob([...]))`. The `blob:` scheme in `worker-src` is strictly required for this mechanism to function.
3. **No `'unsafe-inline'` in `style-src`**:
   - **Rationale**: All frontend apps have been refactored to use static CSS classes (Tailwind CSS v4) and SVG XML attributes (e.g. `MirrorCanvas` 10-tick ring). System Thai font stacks are declared locally without Google Fonts CDNs. No React `style={{}}` inline attributes are used.

---

## ADR-003: Definition of Complete Demographic Data for Patient State Machine

### Status
Accepted (Confirmed by client 2026-10-24)

### Context
Section 7.3.7 of Master Prompt v3 defines patient registration state transitions:
1. Reception or Kiosk creates patient record -> Status starts at `awaiting_face`.
2. Biometric face enrollment occurs (`enroll_face_atomic`):
   - If demographic data is complete -> Status transitions to `active`.
   - If demographic data is incomplete -> Status transitions to `face_enrolled`.
3. If demographic data is completed later (via `PATCH /api/patients/:id`) -> Status transitions from `face_enrolled` to `active`.

### Decision
The client confirmed the mandatory 5-field demographic completeness criterion:
- `first_name` IS NOT NULL AND length > 0
- `last_name` IS NOT NULL AND length > 0
- `age` IS NOT NULL AND age > 0
- `sex` IS NOT NULL AND length > 0
- `injury` IS NOT NULL AND length > 0

All 5 fields must be populated for a patient to transition to `active`. The `injury` field is confirmed mandatory.

---

## ADR-004: Safe Exception Handling for `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`

### Status
Accepted

### Context
In Supabase PostgreSQL, `supabase_admin` is a system administrative role. Attempting to execute `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` without active membership in `supabase_admin` can throw `ERROR: permission denied for role "supabase_admin"` (42501) depending on how the local Postgres cluster or CI environment was initialized.

### Decision
We wrap the `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` block inside an exception handler:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    BEGIN
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping ALTER DEFAULT PRIVILEGES for supabase_admin: insufficient privilege';
    END;
  END IF;
END $$;
```
This ensures baseline migrations succeed deterministically across all environments (local Docker, Supabase CLI, and GitHub Actions CI).

---

## ADR-005: Course Modification Policy When Patient Has Left Active PT Care

### Status
Accepted — Alternative 1: Strict Lock (Confirmed by client 2026-10-24)

### Context
When a patient moves out of a PT's active care (e.g. temporary case delegation window has expired or the patient has been transferred/reassigned to another PT), the PT may still have created past courses for that patient.

Under current RLS policy `courses_update` and trigger `check_course_ownership`:
```sql
IF NOT public.is_patient_accessible_by_pt(NEW.patient_id) THEN
  RAISE EXCEPTION 'Permission denied: PT cannot assign or modify courses for patients not under their active care.';
END IF;
```
Both `UPDATE` and `DELETE` on the course are completely blocked for the original creator PT.

### Decision
**Alternative 1 (Strict Lock)** was chosen by the client:
- Course modification is completely blocked once patient is no longer accessible.
- Only the currently assigned PT or an Admin may modify or cancel the course.
- This aligns with Rule 0 (patient safety first) and Rule 1 (only currently responsible PT or Admin can modify care plans).

---

## ADR-006: match_face_candidates Must Exclude Templates from Superseded Enrollments

### Status
Accepted (2026-10-24)

### Context
When a patient re-enrolls biometrically (e.g., due to appearance change or improved image quality), `enroll_face_atomic` marks the previous `face_enrollments` record as `status = 'superseded'`, but the associated `face_templates` rows remain in the database (they are not deleted). This is by design for audit trail and potential forensic review.

However, `match_face_candidates()` was previously querying `face_templates` directly without checking whether the enrollment was still active, causing stale/superseded templates to pollute matching results.

### Decision
Added `INNER JOIN public.face_enrollments fe ON fe.id = ft.enrollment_id` with filter `fe.status = 'active'` inside `match_face_candidates()`. This ensures only templates from the patient's current active enrollment are used for cosine similarity scoring.

### Verification
pgTAP test F1 creates a patient, enrolls twice (superseding the first), and verifies that `match_face_candidates` returns exactly 1 result (the active enrollment's template only).

---

## ADR-007: enroll_face_atomic Supports Re-enrollment from face_enrolled and active States

### Status
Accepted (2026-10-24)

### Context
The original compare-and-set guard in `enroll_face_atomic` only permitted enrollment from the `awaiting_face` state:
```sql
WHERE id = p_patient_id AND registration_status = 'awaiting_face'
```
This blocked legitimate re-enrollment scenarios where a patient in `face_enrolled` or `active` state needs updated biometric data (e.g., changed appearance, improved photo quality, or enrollment error correction).

The function already handled superseding old enrollments (Step 1), but the CAS guard prevented the patient status update, causing a misleading rollback exception.

### Decision
Expanded the compare-and-set to accept `registration_status IN ('awaiting_face', 'face_enrolled', 'active')`. Only `'archived'` patients are rejected with `RAISE EXCEPTION`. The exception message was updated to clearly state: "Patient % is archived or does not exist. Re-enrollment denied."

### Verification
pgTAP tests F2, F3, and F4 verify:
- F2: Re-enrollment from `face_enrolled` state succeeds
- F3: Re-enrollment from `active` state succeeds and keeps status as `active`
- F4: Enrollment of `archived` patient is still rejected
