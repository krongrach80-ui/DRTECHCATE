# DrTech.Care — Hospital Physical Therapy & Facial Kiosk System (ระบบกายภาพบำบัดโรงพยาบาล)

[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Zero-Leakage Bundle](https://img.shields.io/badge/CI%20Bundle-Zero%20Leaks-success.svg)](scripts/check-bundle.ts)
[![Vitest Passing](https://img.shields.io/badge/Tests-216%20Passed-brightgreen.svg)](vitest.config.ts)

Production-grade hospital physical therapy system designed for Thai hospital outpatient clinics. Features decoupled frontend single-page applications, Express 5 API with Row-Level Security (RLS), append-only clinical records, and Level-A biometric facial recognition for contactless patient authentication and daily mission physical therapy.

---

## 1. System Architecture & Strict Segregation

Following **Master Prompt v3**, the monorepo enforces zero cross-talk, zero Supabase client leakage in frontend bundles, and strict separation of concerns:

```
├── apps/
│   ├── api/                   # Express 5 (Node.js + TypeScript) - ONLY service touching Supabase
│   ├── admin/                 # Hospital Director Web Portal (/admin - 6 views)
│   ├── pt/                    # Physical Therapist Clinical Portal (/pt - 6 views + Reception)
│   └── kiosk/                 # Touchscreen Kiosk Terminal (/kiosk - 13 pure state views)
├── packages/
│   ├── shared/                # Zod schemas, TypeScript contracts, error models (Zero DB code)
│   ├── api-client/            # Exclusive HTTP fetch wrapper for frontends (Zero direct DB access)
│   ├── face-client/           # Client webcam alignment, quality evaluation, 512-dim embedding
│   ├── kiosk-input/           # Sitting presence detection, single-hand tremor filtering (1€ Filter), head nod
│   └── mission-engine/        # Section 9 pure state machine (Zero network, zero UI)
├── docs/
│   ├── DECISIONS.md           # Locked architectural decisions (Decisions 1-10)
│   ├── FACE_TEST_PLAN.md      # Biometric evaluation, calibration plan & FAR/FRR metrics
│   ├── KIOSK_HARDENING.md     # Kiosk OS lock-down, keyboard shortcut blocking & device security
│   └── LEGACY_AUDIT.md        # Migration audit & security vulnerability remediation report
└── supabase/
    └── migrations/            # 27 relational tables, RLS policies, pgvector HNSW, append-only triggers
```

---

## 2. Security & PDPA Invariants

1. **Zero Public/Anon Privileges**: `REVOKE ALL ON ALL TABLES FROM anon`. The `anon` role has 0 read and 0 write permissions.
2. **Strict Frontend Isolation**: Frontend applications (`apps/admin`, `apps/pt`, `apps/kiosk`) do NOT import `@supabase/supabase-js` and contain NO Supabase URLs or secret tokens. Enforced by ESLint and CI bundle scanner `scripts/check-bundle.ts`.
3. **No Biometric Vector Exposure**: 512-dimensional face templates are never returned to clients. Matching is performed exclusively server-side via PostgreSQL `pgvector` HNSW cosine similarity.
4. **Append-Only Clinical History**: `medical_notes`, `treatment_results`, and `audit_logs` are protected by database triggers that reject `UPDATE` and `DELETE` operations. Revisions point to previous versions via `supersedes_id`.
5. **Level-A Biometric Limitation Notice**:
   > **IMPORTANT**: The standard webcam configuration is **Level A (Software-Only)** biometric authentication. It mitigates casual spoofing via dynamic liveness gestures (head nod, look left/right) and quality checks, but cannot defend against advanced physical masks or high-resolution depth spoofs. It MUST NOT be marketed as equivalent to Apple Face ID (which relies on hardware IR structured-light projectors). For Level B security, an ISO/IEC 30107-3 compliant IR/depth `PadProvider` must be attached.

---

## 3. Quick Start & Installation

### 3.1 Prerequisites
- Node.js 20+ (LTS)
- npm 10+
- Supabase CLI or local PostgreSQL 16+ instance with `pgvector` and `pg_trgm` extensions enabled.

### 3.2 Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env.local
```
Fill in the database URL and service keys in `.env.local` (ensure secrets are kept secure and never committed to source control).

### 3.3 Bootstrap Database & Initial Super Admin
```bash
# 1. Install dependencies across monorepo
npm install

# 2. Apply database migrations to Supabase
npx supabase db push

# 3. Create the initial Hospital Director (Super Admin) account
npx tsx scripts/create-admin.ts --username director --email admin@drtech.care --fullname "ผอ. นพ. วิจัย สุขเกษม"
```

To recover or reset an administrative password in emergencies:
```bash
npx tsx scripts/recover-admin.ts --username director
```

---

## 4. Verification & Testing

Run all automated quality, security, and bundle isolation checks:

```bash
# Typecheck across all apps and packages
npm run typecheck

# Monorepo ESLint with restricted-import rules
npm run lint

# Comprehensive test suite (216 tests across 14 test suites)
npx vitest run

# Zero-Leakage & bundle audit verification
npm run ci:bundle
```

---

## 5. Production Deployment (Reverse Proxy)

All applications and APIs must be served from the same domain to enforce `HttpOnly; Secure; SameSite=Strict` cookies and satisfy webcam HTTPS requirements:

```nginx
# Example Nginx Reverse Proxy Configuration
server {
    listen 443 ssl http2;
    server_name clinic.hospital.internal;

    ssl_certificate     /etc/ssl/certs/clinic.crt;
    ssl_certificate_key /etc/ssl/private/clinic.key;

    # Admin Portal
    location /admin {
        proxy_pass http://localhost:5173;
    }

    # Physical Therapist Portal
    location /pt {
        proxy_pass http://localhost:5174;
    }

    # Kiosk Terminal
    location /kiosk {
        proxy_pass http://localhost:5175;
    }

    # Express API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Realtime Server-Sent Events (SSE)
    location /api/events {
        proxy_pass http://localhost:4000;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

---

## 6. Documentation References

- **Architecture Decisions**: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- **Face Calibration & Test Plan**: [`docs/FACE_TEST_PLAN.md`](docs/FACE_TEST_PLAN.md)
- **Kiosk Hardening & Physical Security**: [`docs/KIOSK_HARDENING.md`](docs/KIOSK_HARDENING.md)
- **Legacy Migration & Security Audit**: [`docs/LEGACY_AUDIT.md`](docs/LEGACY_AUDIT.md)
