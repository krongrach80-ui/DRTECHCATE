import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { defaultPatientRepository } from '../modules/patients/repository';
import { defaultDirectoryRepository } from '../modules/directory/repository';
import { defaultAuditRepository } from '../modules/audit/repository';
import { defaultRecordsRepository } from '../modules/records/repository';
import { resetAuthTestState } from '../middleware/authenticate';

describe('[UNIT] DrTech.Care System 9: Clinical Records (Notes & Versioned Treatment Results)', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    resetAuthTestState();
  });

  // =========================================================================
  // 1. MEDICAL NOTES (APPEND-ONLY CLINICAL NOTES)
  // =========================================================================
  describe('1. Medical Notes (Append-Only & Access Boundaries)', () => {
    it('1.1 Allows responsible PT to create and read medical notes for their own patient', async () => {
      // 1. PT-1 creates a patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'พรทิพย์', last_name: 'คนไข้ประจำ' },
        'pt-001',
        'pt-001'
      );

      // 2. PT-1 appends note
      const postRes = await request(app)
        .post(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'คนไข้มีอาการปวดไหล่ขวาลดลงหลังจากฝึกท่าดึงยางยืด' });

      expect(postRes.status).toBe(201);
      expect(postRes.body.ok).toBe(true);
      expect(postRes.body.data.body).toContain('คนไข้มีอาการปวดไหล่ขวา');
      expect(postRes.body.data.author_id).toBe('pt-001');

      // 3. PT-1 reads notes
      const getRes = await request(app)
        .get(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(getRes.status).toBe(200);
      expect(getRes.body.ok).toBe(true);
      expect(getRes.body.data.length).toBe(1);
      expect(getRes.body.data[0].body).toContain('คนไข้มีอาการปวดไหล่ขวา');
    });

    it('1.2 Forbids another PT from reading or writing notes for a patient not under their care (403)', async () => {
      // 1. PT-1 creates a patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'มานพ', last_name: 'หมอหนึ่งดูแล' },
        'pt-001',
        'pt-001'
      );

      // 2. PT-2 attempts to append note -> 403 Forbidden
      const postRes = await request(app)
        .post(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'หมอสองแอบเขียนโน้ต' });

      expect(postRes.status).toBe(403);
      expect(postRes.body.error.code).toBe('FORBIDDEN');

      // 3. PT-2 attempts to read notes -> 403 Forbidden
      const getRes = await request(app)
        .get(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(getRes.status).toBe(403);
      expect(getRes.body.error.code).toBe('FORBIDDEN');
    });

    it('1.3 Allows delegate PT to access notes during active case transfer window', async () => {
      const today = new Date().toISOString().split('T')[0];

      // 1. PT-1 creates patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'อรทัย', last_name: 'เคสฝาก' },
        'pt-001',
        'pt-001'
      );

      // 2. Transfer case to PT-2
      await defaultDirectoryRepository.createCaseTransfer(
        {
          patient_id: patient.id,
          to_pt_id: 'pt-002',
          start_date: today,
          end_date: today,
        },
        'pt-001',
        'pt-001'
      );

      // 3. PT-2 can append note during transfer
      const postRes = await request(app)
        .post(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'หมอสองตรวจอาการแทนในช่วงฝากเคส' });

      expect(postRes.status).toBe(201);
      expect(postRes.body.ok).toBe(true);
    });

    it('1.4 Records audit log when medical notes are read and written (Section 11 Line 409)', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'สมจิต', last_name: 'ตรวจสอบออดิท' },
        'pt-001',
        'pt-001'
      );

      // Write note
      await request(app)
        .post(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'บันทึกโน้ตเพื่อเช็ค audit' });

      // Read note
      await request(app)
        .get(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      // Check audit logs
      const { logs } = await defaultAuditRepository.query({ entity: 'patients', page: 1, limit: 50 });
      const readAudit = logs.find((l: any) => l.action === 'READ_MEDICAL_NOTES');
      expect(readAudit).toBeDefined();
      expect(readAudit?.actor_id).toBe('pt-001');

      const { logs: noteLogs } = await defaultAuditRepository.query({ entity: 'medical_notes', page: 1, limit: 50 });
      const createAudit = noteLogs.find((l: any) => l.action === 'CREATE_MEDICAL_NOTE');
      expect(createAudit).toBeDefined();
    });
  });

  // =========================================================================
  // 2. VERSIONED TREATMENT RESULTS (LOCKED DECISION #2)
  // "แก้ผลการรักษา = เพิ่มเวอร์ชันใหม่ ชี้ supersedes_id ไม่มี UPDATE/DELETE"
  // =========================================================================
  describe('2. Versioned Treatment Results (History & Supersedes Pointer)', () => {
    it('2.1 Creates initial treatment result as Version 1 with supersedes_id = null', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'วีระ', last_name: 'เริ่มการรักษา' },
        'pt-001',
        'pt-001'
      );

      const res = await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          body: 'การประเมินรอบแรก: ขยับไหล่ได้ 45 องศา ยังมีอาการเจ็บเสียว',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.supersedes_id).toBeNull();
      expect(res.body.data.body).toContain('การประเมินรอบแรก');
    });

    it('2.2 Updating treatment result creates Version 2 pointing to supersedes_id of Version 1', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'สุชาติ', last_name: 'ติดตามอาการ' },
        'pt-001',
        'pt-001'
      );

      // Version 1
      const v1Res = await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          body: 'เวอร์ชัน 1: องศาการยกแขน 60 องศา',
        });
      const v1Id = v1Res.body.data.id;
      expect(v1Res.body.data.version).toBe(1);

      // Version 2 (Supersedes Version 1)
      const v2Res = await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          body: 'เวอร์ชัน 2: องศาการยกแขนดีขึ้นเป็น 90 องศาหลังฝึก 2 สัปดาห์',
          supersedes_id: v1Id,
        });

      expect(v2Res.status).toBe(201);
      expect(v2Res.body.ok).toBe(true);
      expect(v2Res.body.data.version).toBe(2);
      expect(v2Res.body.data.supersedes_id).toBe(v1Id);

      // Version 3 (Supersedes Version 2)
      const v3Res = await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          body: 'เวอร์ชัน 3: องศาการยกแขนเกือบปกติ 140 องศา สามารถจบโปรแกรมกายภาพ',
          supersedes_id: v2Res.body.data.id,
        });

      expect(v3Res.status).toBe(201);
      expect(v3Res.body.data.version).toBe(3);
      expect(v3Res.body.data.supersedes_id).toBe(v2Res.body.data.id);
    });

    it('2.3 Reading treatment results returns full history (All versions preserved and readable)', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'กานต์ดา', last_name: 'ตรวจประวัติเวอร์ชัน' },
        'pt-001',
        'pt-001'
      );

      // Create V1 and V2
      const v1 = await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'ผลการรักษา V1' });

      await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'ผลการรักษา V2', supersedes_id: v1.body.data.id });

      // Get all treatment results
      const listRes = await request(app)
        .get(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(2);
      expect(listRes.body.data[0].version).toBe(1);
      expect(listRes.body.data[0].body).toBe('ผลการรักษา V1');
      expect(listRes.body.data[1].version).toBe(2);
      expect(listRes.body.data[1].body).toBe('ผลการรักษา V2');
      expect(listRes.body.data[1].supersedes_id).toBe(v1.body.data.id);
    });

    it('2.4 Rejects invalid supersedes_id with 400', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ธีรเดช', last_name: 'รหัสอ้างอิงผิด' },
        'pt-001',
        'pt-001'
      );

      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          body: 'พยายามอ้างอิง ID ที่ไม่มีอยู่',
          supersedes_id: fakeUuid,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SUPERSEDES_ID');
    });
  });

  // =========================================================================
  // 3. IMMUTABILITY ENFORCEMENT & DoD VERIFICATION
  // "เสร็จเมื่อ: เวอร์ชันเก่าอ่านได้ครบและแก้/ลบไม่ได้ในทุกช่องทาง"
  // =========================================================================
  describe('3. Immutability: No UPDATE/DELETE Routes & DB Trigger Protection', () => {
    it('3.1 Rejects PUT, PATCH, and DELETE on medical notes with 405 Method Not Allowed', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'เอกชัย', last_name: 'ห้ามลบโน้ต' },
        'pt-001',
        'pt-001'
      );

      // PUT /api/patients/:id/notes -> 405
      const putRes = await request(app)
        .put(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'พยายามแก้โน้ต' });
      expect(putRes.status).toBe(405);
      expect(putRes.body.error.code).toBe('METHOD_NOT_ALLOWED');

      // PATCH /api/patients/:id/notes -> 405
      const patchRes = await request(app)
        .patch(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'พยายามแก้บางส่วน' });
      expect(patchRes.status).toBe(405);
      expect(patchRes.body.error.code).toBe('METHOD_NOT_ALLOWED');

      // DELETE /api/patients/:id/notes -> 405
      const deleteRes = await request(app)
        .delete(`/api/patients/${patient.id}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(deleteRes.status).toBe(405);
      expect(deleteRes.body.error.code).toBe('METHOD_NOT_ALLOWED');

      // DELETE /api/patients/:id/notes/:noteId -> 405
      const deleteItemRes = await request(app)
        .delete(`/api/patients/${patient.id}/notes/note-123`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(deleteItemRes.status).toBe(405);
      expect(deleteItemRes.body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('3.2 Rejects PUT, PATCH, and DELETE on treatment results with 405 Method Not Allowed', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'เอกชัย', last_name: 'ห้ามลบผลรักษา' },
        'pt-001',
        'pt-001'
      );

      // PUT /api/patients/:id/treatment-results -> 405
      const putRes = await request(app)
        .put(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'พยายามแก้ผล' });
      expect(putRes.status).toBe(405);
      expect(putRes.body.error.code).toBe('METHOD_NOT_ALLOWED');

      // PATCH /api/patients/:id/treatment-results -> 405
      const patchRes = await request(app)
        .patch(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'พยายามแก้ผลบางส่วน' });
      expect(patchRes.status).toBe(405);
      expect(patchRes.body.error.code).toBe('METHOD_NOT_ALLOWED');

      // DELETE /api/patients/:id/treatment-results -> 405
      const deleteRes = await request(app)
        .delete(`/api/patients/${patient.id}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(deleteRes.status).toBe(405);
      expect(deleteRes.body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('3.3 Repository rejects direct modification or deletion attempts', async () => {
      await expect(defaultRecordsRepository.rejectDirectUpdateNote('note-123')).rejects.toThrow(
        /IMMUTABLE_RECORD/
      );
      await expect(defaultRecordsRepository.rejectDirectDeleteNote('note-123')).rejects.toThrow(
        /IMMUTABLE_RECORD/
      );
      await expect(
        defaultRecordsRepository.rejectDirectUpdateTreatmentResult('result-123')
      ).rejects.toThrow(/IMMUTABLE_RECORD/);
      await expect(
        defaultRecordsRepository.rejectDirectDeleteTreatmentResult('result-123')
      ).rejects.toThrow(/IMMUTABLE_RECORD/);
    });
  });
});
