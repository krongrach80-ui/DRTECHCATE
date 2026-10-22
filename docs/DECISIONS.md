# ข้อตัดสินใจทางสถาปัตยกรรมและข้อกำหนดที่ล็อกไว้ (Architecture Decisions)
ระบบกายภาพบำบัดโรงพยาบาล (DrTech.Care) — Master Prompt v3

> **คำเตือน:** เอกสารนี้รวบรวมข้อตัดสินใจหลักตามข้อ 0 ของ Master Prompt v3 ห้ามแก้ไขหรือเปลี่ยนแปลงการตัดสินใจเหล่านี้โดยไม่ได้รับความเห็นชอบจากผู้ใช้/ผู้บริหารระบบ

---

## สรุปการตัดสินใจ 10 ข้อหลัก (Locked Decisions)

| # | หัวข้อ | ข้อสรุปและรายละเอียดการบังคับใช้ |
|---|---|---|
| **1** | **PT เห็น/แก้คนไข้** | เฉพาะคนไข้ที่ตนเองรับผิดชอบ (`patient_pt_assignments` ที่ `pt_id = auth.uid()`) และเคสที่ได้รับฝากชั่วคราว (`case_transfers` ที่ `to_pt_id = auth.uid()` ในช่วงวันที่ active: `start_date <= CURRENT_DATE <= end_date`) เท่านั้น บังคับทั้งที่ Express Service layer และ Postgres RLS (`is_patient_accessible_by_pt`) |
| **2** | **"แก้ผลการรักษา" vs append-only** | การ "แก้ไข" = เพิ่มแถวเวอร์ชันใหม่เสมอ (`version = old_version + 1`, อ้างอิง `supersedes_id` ของเวอร์ชันก่อนหน้า) ข้อมูลเวอร์ชันเก่าคงอยู่อ่านได้ตลอดไป **ไม่มีคำสั่ง UPDATE หรือ DELETE** และมี Database Trigger ป้องกันอย่างเด็ดขาด |
| **3** | **คนไข้ที่ตู้พิมพ์ไม่ได้** | ตู้ Kiosk ไม่มีแป้นพิมพ์หน้าจอ (No Virtual/Physical Keypad) สำหรับพิมพ์ HN หรือเบอร์โทรศัพท์ เพื่อสุขอนามัยและความปลอดภัย หากสแกนหน้าไม่ผ่านครบ 3 ครั้ง กลไก Fallback คือปุ่ม **"เรียกเจ้าหน้าที่" (Call Staff)** ให้สร้างงานใน `staff_calls` เท่านั้น |
| **4** | **ท่ากายภาพบนตู้ (รอบแรก)** | แสดงรายการท่าที่แพทย์/PT จัดไว้ (ชื่อท่า, รูปภาพประกอบ, เซ็ต × จำนวนครั้ง) คนไข้ฝึกทำต่อหน้า PT แล้วกดปุ่ม "ทำเสร็จ" เพื่อบันทึกความคืบหน้า ยังไม่มีการตรวจจับมุมกระดูกหรือวัดท่าด้วย AI ในรอบนี้ (เก็บไว้เป็นเฟสส่วนขยายถัดไป) |
| **5** | **HN (Hospital Number)** | ออกเลข HN จาก Database Sequence ใน PostgreSQL เท่านั้น ห้ามสุ่ม (random) หรือใช้ timestamp โดยเด็ดขาด เพื่อป้องกันเลขซ้ำและเป็นไปตามมาตรฐานเวชระเบียนโรงพยาบาล |
| **6** | **คนไข้ล็อกอินเว็บ** | **ไม่มี** คนไข้มีสถานะเป็นข้อมูลในตาราง `patients` เท่านั้น ไม่มีแถวใน `auth.users` ของ Supabase, ไม่มีรหัสผ่าน, ไม่สามารถเข้าสู่ระบบผ่านเว็บเบราว์เซอร์ได้ เข้าใช้งานตู้ Kiosk ด้วยใบหน้าเท่านั้น จึง **ไม่มีฟีเจอร์รีเซ็ตรหัสผ่านคนไข้** |
| **7** | **ลำดับการลงทะเบียน (Enrollment Flow)** | **ทางหลัก:** เจ้าหน้าที่/PT ที่หน้าต้อนรับ (Reception) สร้างและกรอกข้อมูลประวัติคนไข้ลงในระบบก่อน แล้วกด "ส่งไปลงทะเบียนหน้าที่ตู้ N" (ออก `enrollment_ticket`) จากนั้นคนไข้เดินไปสแกนหน้าที่ตู้ตาม Ticket<br>**ทางเลือก:** การสแกนหน้าก่อนที่ตู้ (self-enroll) จะปิดไว้ตามค่าเริ่มต้น (`ALLOW_KIOSK_SELF_ENROLL=false`) |
| **8** | **ระดับความปลอดภัยการสแกนใบหน้า** | ระบบเริ่มต้นเป็น **ระดับ A (ซอฟต์แวร์ล้วน - Software-only RGB)** ป้องกันภาพนิ่ง/วิดีโอด้วย Liveness (Active challenge + Passive texture PAD) แต่ไม่เทียบเท่าระบบฮาร์ดแวร์วัดความลึก (IR/Depth 3D Structured Light เช่น Face ID) จึง **ห้ามอ้างว่าเทียบเท่า Face ID** โดยออกแบบสถาปัตยกรรมให้รองรับการต่อขยายเป็นระดับ B ในอนาคตผ่านอินเทอร์เฟซ `PadProvider` |
| **9** | **บัตรคิว** | ไม่อยู่ในขอบเขตของระบบนี้ (โฟลว์ของระบบตู้สิ้นสุดที่ Daily Mission และส่งผลกลับมายัง PT Portal) หากโรงพยาบาลต้องการระบบบัตรคิว ให้แยกพัฒนาเป็นโมดูลเสริมต่างหากในภายหลัง |
| **10** | **การลบข้อมูลและการจัดการสิทธิ์ PDPA** | แยกกระบวนการ **"ลบข้อมูลชีวมาตร (Biometric Erasure)"** (ลบไฟล์ภาพถ่าย 10 เฟรมจาก Private Storage และลบ embedding vector ออกจาก `face_templates` จริง) ออกจากกระบวนการ **"ปิดบัญชี/ยุติการดูแล (Archive Patient)"** (ซึ่งต้องเก็บรักษาประวัติเวชระเบียนทางการแพทย์ตามกฎหมาย) **ห้ามลบแฟ้มประวัติคนไข้ทั้งแฟ้ม** |

---

## กฎและข้อบังคับทางสถาปัตยกรรม (Architectural Invariants)

1. **โครงสร้างแยกส่วนจริง (Decoupled Monorepo / Services):**
   - `apps/api`: Backend API เดียวด้วย Express 5.x + TypeScript ที่เชื่อมต่อกับ Supabase
   - `apps/admin`: SPA Client (React + Vite + Tailwind + TanStack Query) ไม่คุยกับ Supabase โดยตรง
   - `apps/pt`: SPA Client (React + Vite + Tailwind + TanStack Query) ไม่คุยกับ Supabase โดยตรง
   - `apps/kiosk`: SPA Client สำหรับตู้ Kiosk (React + Vite) ไม่คุยกับ Supabase โดยตรง
   - `packages/shared`, `api-client`, `face-client`, `kiosk-input`, `mission-engine`
2. **ห้ามติดตั้ง Supabase SDK ใน Frontend:**
   - ห้ามติดตั้งหรือ import `@supabase/supabase-js` ใน `apps/admin`, `apps/pt`, `apps/kiosk` และ `packages/*`
   - ควบคุมด้วย ESLint `no-restricted-imports` และ CI inspection script
3. **Frontend ห้ามเก็บข้อมูลผู้ป่วยลงใน Web Storage:**
   - ห้ามเก็บข้อมูลคนไข้, vector, token, รูปภาพลงใน `localStorage`, `sessionStorage`, หรือ `IndexedDB`
   - การสื่อสารและคงสถานะเซสชันทำผ่าน `HttpOnly; Secure; SameSite=Strict` Cookie
4. **การคำนวณเวกเตอร์ใบหน้า (512-dim Cosine):**
   - โมเดลสกัดเวกเตอร์ใบหน้าขนาด 512 มิติ (ArcFace/AdaFace standard)
   - การจับคู่เวกเตอร์ทำที่เซิร์ฟเวอร์ด้วย `pgvector` (HNSW cosine similarity) เท่านั้น ห้ามส่ง vector กลับไปยัง client
