# ขั้นตอนการรีเซ็ตฐานข้อมูล (Database Reset Procedure)

> [!CAUTION]
> **คำเตือนความปลอดภัยระดับวิกฤต: ขั้นตอนนี้เป็นการทำลายข้อมูลทั้งหมด (DESTRUCTIVE ACTION)**  
> **ห้ามรันคำสั่งเหล่านี้โดยพลการหรือโดยอัตโนมัติเป็นอันขาด จนกว่าผู้ใช้ (USER) จะออกคำสั่งอนุมัติอย่างเป็นทางการ**  
> การรัน `DROP SCHEMA public CASCADE;` จะลบตาราง ประวัติการรักษา ข้อมูลผู้ป่วย และ Default Privileges ดั้งเดิมของ Supabase ทิ้งทั้งหมด

---

## 1. ผลกระทบของการรัน Schema Reset
1. ข้อมูลในทุกตาราง (27 ตาราง) จะถูกลบทันที ไม่สามารถย้อนกลับได้
2. สิทธิ์ Default Privileges ที่ Supabase จัดสรรให้กับ `service_role` และ `authenticated` จะถูกทำลายลงพร้อมกับ schema `public`
3. ดังนั้น Migration ไฟล์ `supabase/migrations/20261024000001_baseline.sql` ได้ถูกออกแบบมาให้รองรับการฟื้นฟูหลัง Reset โดยมีคำสั่ง:
   - `GRANT USAGE ON SCHEMA public TO postgres, service_role, authenticated;`
   - `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`
   - `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`
   - `GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;`
   - และกำหนดสิทธิ์ Allowlist ที่เข้มงวดให้แก่ `authenticated`

---

## 2. ขั้นตอนการดำเนินการ (เฉพาะกรณีได้รับคำสั่งอนุมัติจากผู้ใช้แล้วเท่านั้น)

### ขั้นตอนที่ 1: ตรวจสอบความปลอดภัย
- ยืนยันว่า **ไม่ใช่สภาพแวดล้อม Production Remote** (ห้ามแตะ Supabase remote)
- ยืนยันว่าทำบน **Local Development หรือ CI เท่านั้น**
- สำรองข้อมูล (Backup) หากมีข้อมูลสำคัญ

### ขั้นตอนที่ 2: รันคำสั่ง Reset Schema บน Local/CI Postgres
```sql
-- รันโดยบทบาท postgres superuser เท่านั้น
BEGIN;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
COMMIT;
```

### ขั้นตอนที่ 3: Re-apply Migration Baseline
```bash
# บนสภาพแวดล้อม Local / CI:
npx supabase db reset
# หรือ
npm run db:migrate
```

### ขั้นตอนที่ 4: ตรวจสอบสิทธิ์หลัง Migration
รันชุดทดสอบ pgTAP เพื่อยืนยันว่า:
- `service_role` สามารถเข้าถึงตารางและ RPC ทั้งหมดได้ตามปกติ
- `authenticated` เข้าถึงได้เฉพาะ 16 ตาราง allowlist ผ่าน RLS
- `anon` ถูกปฏิเสธ 100% ในทุกตาราง
