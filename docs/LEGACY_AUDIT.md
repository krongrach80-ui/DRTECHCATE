# รายงานการตรวจสอบโค้ดเดิมและการประเมินความเสี่ยง (Legacy Code Audit & Risk Analysis)
**ระบบกายภาพบำบัดโรงพยาบาล (DrTech.Care) — Master Prompt v3**

เอกสารนี้จัดทำขึ้นเพื่อบันทึกผลการตรวจสอบโค้ดเดิม สรุปรายการความเสี่ยงทางสถาปัตยกรรมและความมั่นคงปลอดภัย (Security Vulnerabilities) และเปรียบเทียบความแตกต่างระหว่างระบบเดิมกับข้อกำหนดของ Master Prompt v3

---

## 1. บทสรุปสถาปัตยกรรมเดิม (Legacy Architecture Summary)

ระบบเดิมถูกสร้างขึ้นเป็น **Next.js 16 (App Router) Monolith** อยู่ในโฟลเดอร์เดียว (`src/`):
* รวม Admin Portal (`src/app/admin`), PT Portal (`src/app/pt`), Kiosk Client (`src/app/kiosk`) และ Next.js API Route Handlers (`src/app/api`) ไว้ในแอปพลิเคชันเดียวกัน
* **Frontend ต่อ Supabase ตรงๆ / NEXT_PUBLIC key:** มีการนำ `@supabase/ssr` และ `@supabase/supabase-js` มาใช้ใน Client Components บนเบราว์เซอร์ ทำให้ `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ฝังลงใน Client JavaScript Bundle ซึ่งเสี่ยงต่อการถูกเจาะระบบหาก Anon Key มีสิทธิ์ RLS และขัดกับกฎเหล็กข้อ 4 ของ Master Prompt v3 อย่างสิ้นเชิง

---

## 2. รายการความเสี่ยงและการละเมิดกฎเหล็ก (Critical Invariant Violations)

| # | ประเด็นที่ตรวจพบในโค้ดเดิม | กฎเหล็กที่ฝ่าฝืน | ระดับความเสี่ยง | คำอธิบายและผลกระทบ |
|---|---|---|---|---|
| **V0** | **Frontend ต่อ Supabase ตรงๆ / มี NEXT_PUBLIC key ในเบราว์เซอร์** | ข้อ 2 กฎเหล็ก #4 | **วิกฤต (Critical)** | โค้ดเดิมใน `src/lib/supabase/client.ts` และ components ต่างๆ นำเข้า SDK Supabase และเรียกใช้บนเบราว์เซอร์ ทำให้ Client Bundle ถือ URL และ Anon Key ของฐานข้อมูลโดยตรง ฝ่าฝืนกฎเหล็กข้อ 4 ที่ห้าม Frontend คุยกับ Supabase โดยเด็ดขาด |
| **V1** | **คนไข้ถูกผูกกับ `auth.users`** | ข้อ 0 ข้อ 6 | **วิกฤต (Critical)** | ใน `20261022000001_initial_schema.sql` ตาราง `patients` มีคอลัมน์ `user_id UUID PRIMARY KEY REFERENCES profiles(id) REFERENCES auth.users(id)` ซึ่งหมายความว่าคนไข้ทุกคนมีบัญชี Supabase Auth เปิดช่องทางให้คนไข้พยายามล็อกอินเว็บ หรือเข้าถึง anon/authenticated RLS endpoints ได้โดยตรง ซึ่งขัดกับสเปก v3 ที่คนไข้ต้องเป็นเพียง Record ในตาราง `patients` ไม่มีบัญชีล็อกอิน |
| **V2** | **มีแป้นพิมพ์ตัวเลขบนตู้ Kiosk** | ข้อ 0 ข้อ 3 | **สูง (High)** | มีการสร้างไฟล์ `src/components/kiosk/KioskPhoneKeypad.tsx` ซึ่งเปิดให้คนไข้พิมพ์เบอร์โทร/HN เพื่อเช็คอิน เสี่ยงต่อการสวมสิทธิ์ (Impersonation) และปัญหาด้านสุขอนามัยในโรงพยาบาล สเปก v3 กำหนดชัดเจนว่าตู้ต้องไม่มีแป้นพิมพ์ หากสแกนหน้าไม่ผ่านกลไก fallback คือปุ่ม "เรียกเจ้าหน้าที่" เท่านั้น |
| **V3** | **มีระบบบัตรคิว (Queue Ticket)** | ข้อ 0 ข้อ 9 | **ปานกลาง (Medium)** | มีการสร้างไฟล์ `src/components/kiosk/KioskQueueTicket.tsx` และ API `/api/kiosk/queue` ซึ่งอยู่นอกขอบเขต (Out of Scope) ของ v3 (โฟลว์ของระบบตู้สิ้นสุดที่ Daily Mission) |
| **V4** | **มิติเวกเตอร์ใบหน้าไม่ตรงสเปก** | ข้อ 7.1 | **สูง (High)** | Schema เดิมใช้ `vector(128)` อ้างอิงจาก face-api.js (MobileNet/ResNet-34) ซึ่งมีมิติและความละเอียดต่ำเกินไปสำหรับการพิสูจน์ตัวตนแบบ 1:N Verification ที่ตู้ Kiosk ในโรงพยาบาล สเปก v3 กำหนดให้ใช้เวกเตอร์ **512 มิติ** (ArcFace/AdaFace standard) เท่านั้น |
| **V5** | **มี Hardcoded Demo Token ใน Client** | ข้อ 2 กฎเหล็ก #2 | **สูง (High)** | ใน `KioskPhoneKeypad.tsx` พบโค้ด fallback: `'x-kiosk-token': deviceToken || process.env.NEXT_PUBLIC_DEFAULT_KIOSK_TOKEN || 'demo-kiosk-token'` ซึ่งเป็นการ Hardcode Token จำลอง ถือเป็นการละเมิดกฎเหล็กข้อ 2 ที่ห้าม Mock/Stub/Fake ใน Production |
| **V6** | **ขาด Database Sequence สำหรับ HN** | ข้อ 0 ข้อ 5 | **ปานกลาง (Medium)** | Schema เดิมเก็บ HN เป็นสตริงทั่วไป ไม่มีการกำหนด Sequence ใน PostgreSQL มีความเสี่ยงต่อการสร้างเลข HN ซ้ำ หรือการใช้ timestamp/สุ่ม ซึ่งผิดมาตรฐานเวชระเบียน |
| **V7** | **ขาดตารางหลักตามสเปก v3** | ข้อ 4 | **สูง (High)** | Schema เดิมขาดตารางสำคัญหลายรายการ เช่น `treatment_results` (versioned append-only), `minigames`, `minigame_questions`, `modpacks`, `modpack_items`, `mission_runs`, `mission_steps`, `staff_devices`, `staff_calls`, `bans`, `enrollment_tickets`, `checkins` |
| **V8** | **Trigger จำกัดสิทธิ์ผิดเพี้ยน** | ข้อ 4, ข้อ 8.2 | **ปานกลาง (Medium)** | ใน `20261022000002_rls_and_policies.sql` มี Trigger `validate_course_item_exercise_type` ที่บล็อกไม่ให้ PT จ่าย exercise (อนุญาตเฉพาะ minigame) ซึ่งขัดกับเวชปฏิบัติจริง |

---

## 3. ผลการตรวจสอบประวัติ Git เชิงลึก (Deep Git History & Secrets Audit)

### 3.1 คำสั่งที่ใช้สแกนประวัติ Git ทั้งหมด (`git log --all`):
```powershell
# 1. ตรวจสอบรูปแบบคีย์ Supabase รุ่นใหม่ (sb_secret_*, sb_publishable_*)
git log --all -p -S "sb_secret_" -S "sb_publishable_"

# 2. ตรวจสอบตัวแปรสภาพแวดล้อมที่รั่วไหลไปสู่เบราว์เซอร์ (NEXT_PUBLIC_*)
git log -S "NEXT_PUBLIC_" -p | Select-String -Pattern "NEXT_PUBLIC_[A-Z0-9_]+" -AllMatches

# 3. ตรวจสอบ Service Role Key
git log --all -p -S "service-role" -S "service_role"

# 4. ตรวจสอบไฟล์ .env ทั้งหมดในประวัติการ Commit
git log --all --name-only --oneline | Select-String "\.env"

# 5. ตรวจสอบไฟล์รูปภาพทั้งหมดในประวัติการ Commit
git log --all --name-only --oneline | Select-String -Pattern "\.(jpg|jpeg|png|webp|gif|bmp|ico|svg)$" | Sort-Object -Unique

# 6. ตรวจสอบการค้นหาคีย์และบทสรุปด้วยคำสั่ง regex (-G)
git log --all -p -G "sb_secret_|sb_publishable_|service-role|service_role"
```

### 3.2 ผลลัพธ์จากการตรวจสอบ:
* **รูปแบบ `sb_secret_` และ `sb_publishable_`:** ตรวจสอบด้วยคำสั่ง regex `-G` บนทุก Branch — **ไม่พบในประวัติการ Commit เลย (สะอาด 100%)**
* **ไฟล์ `.env*` ในประวัติ:** **ไม่เคย** มีการ Commit ไฟล์ `.env`, `.env.local`, หรือ `.env.*` เข้าสู่ Git Repository เลย
* **รายการนามสกุลไฟล์ทั้งหมดที่เคยปรากฏในประวัติ Git (Exhaustive Extension Inventory):**
  - `.css` (สไตล์ชีต เช่น `globals.css`)
  - `.gitignore` (การตั้งค่า Git ignore)
  - `.ico` (`src/app/favicon.ico`)
  - `.json` (`package.json`, `package-lock.json`, `tsconfig.json`)
  - `.md` (`README.md`, `AGENTS.md`, `public/models/README.md`)
  - `.mjs` (`eslint.config.mjs`)
  - `.mts` (`vitest.config.mts`)
  - `.sql` (`supabase/migrations/*.sql`)
  - `.svg` (`public/*.svg` ไอคอนมาตรฐาน Next.js)
  - `.ts` (ซอร์สโค้ด TypeScript)
  - `.tsx` (คอมโพเนนต์ React TypeScript)
  *(หมายเหตุ: ยืนยันว่า **ไม่มี** ไฟล์ `.csv`, `.xlsx`, `.pdf`, `.zip`, `.bin`, `.jpg`, `.jpeg`, `.png`, หรือ `.webp` ใดๆ ในประวัติการ Commit เลย)*
* **JWT Tokens / Connection Strings:** ไม่พบ Secret Key หรือรหัสผ่านฐานข้อมูลจริง (มีเพียง npm subresource integrity hashes ใน `package-lock.json`)
* **ตัวแปร `NEXT_PUBLIC_*` ที่ตรวจพบ:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, และ `NEXT_PUBLIC_DEFAULT_KIOSK_TOKEN` (พร้อม hardcoded fallback ใน component เดิม)

---

## 4. นโยบายการเตรียมฐานข้อมูลว่าง (Empty Database Starting Policy)

ตามกฎเหล็กข้อ 1 ("ห้ามมีบัญชี demo, ข้อมูลตัวอย่าง, seed ผู้ใช้ปลอม, รหัสผ่านฝังในโค้ด เริ่มจากฐานข้อมูลว่าง"):
การเริ่มต้นจากฐานข้อมูลที่ว่างเปล่า 100% สามารถเลือกดำเนินการได้ **2 แนวทาง (โดยผู้ใช้เป็นผู้ตัดสินใจเลือก):**
1. **รีเซ็ตฐานข้อมูลเดิม (DB Reset):** รีเซ็ตฐานข้อมูลบน Dev Project เดิมเพื่อให้ตารางและ Schema เก่าถูกล้างออกทั้งหมดจนว่างเปล่า
2. **สร้างโปรเจกต์ใหม่ (Create New Dev Project):** สร้าง Supabase Dev Project ใหม่เอี่ยมที่ยังไม่มีการรัน Schema ใดๆ มาก่อน

*(ห้ามใช้วิธีซ่อมแซมประวัติหรือไมเกรตทับข้อมูลเก่าที่ Schema ไม่ตรงสเปก)*

---

## 5. มาตรการที่ดำเนินการแล้ว (Remediation & Isolation Actions)

1. **จัดทำ Git Snapshot Tag:** บันทึก Git Tag `pre-monorepo` ที่ Commit ล่าสุดก่อนการปรับโครงสร้าง เพื่อให้สามารถย้อนกลับมาดูประวัติเดิมได้เสมอ
2. **ย้ายโค้ดด้วย `git mv`:** ย้ายโค้ดเดิมทั้งหมดจาก `src/` ไปยัง `legacy-src/` ด้วยคำสั่ง `git mv src legacy-src` ซึ่งทำให้ Git บันทึกเป็น File Rename (R) 100% คงประวัติการพัฒนาเดิมไว้ครบถ้วน
3. **ตัดแยก (Exclude) ออกจากระบบ Build, Linter และ TypeCheck:**
   * เพิ่ม `"legacy-src"` และ `".next"` ใน `exclude` ของ `tsconfig.json`
   * เพิ่ม `"legacy-src/**"` ใน `globalIgnores` ของ `eslint.config.mjs`
   * ทดสอบรัน `npm run lint` และ `npx tsc --noEmit` แล้ว — ผ่านเรียบร้อย 0 Errors
4. **ล้าง Migrations เก่าที่ Schema ผิดสเปก:** ย้ายไฟล์ Migrations เดิมออกจาก `supabase/migrations/` และจัดทำชุด Migration สะอาดใหม่ 5 ไฟล์ (27 ตาราง)
