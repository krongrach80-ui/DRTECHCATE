import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { defaultKioskRepository } from '../modules/kiosk/repository';
import { defaultCourseRepository } from '../modules/courses/repository';
import { defaultPatientRepository } from '../modules/patients/repository';
import { hospitalEventBus, HospitalEvent } from '../modules/events/routes';
import {
  l2Normalize,
  averageAndNormalize,
  cosineSimilarity,
  generateSyntheticVector,
  FaceQualityChecker,
  FaceAligner,
  CameraManager,
  MockPadProvider,
  FaceFlowManager,
  MockFaceDetector,
  MockEmbeddingModel,
} from '../../../../packages/face-client/src/index';

describe('[UNIT] DrTech.Care System 7: Kiosk Face Authentication & Liveness Suite', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
  });

  beforeEach(() => {
    defaultKioskRepository.clearPairings();
    defaultCourseRepository.clearInMemory();
    defaultPatientRepository.clearInMemory();
  });

  // =========================================================================
  // 1. CHALLENGE & NONCE LIFECYCLE
  // =========================================================================
  describe('1. Challenge Nonce Single-Use & Expiration', () => {
    it('1.1 Generates a 32-byte hex nonce with 2 random distinct gesture steps', async () => {
      const res = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.nonce).toBe('string');
      expect(res.body.nonce.length).toBe(64); // 32 bytes in hex = 64 characters
      expect(Array.isArray(res.body.steps)).toBe(true);
      expect(res.body.steps.length).toBe(2);
      expect(res.body.expires_in_seconds).toBe(60);

      // Verify gestures are from allowed set and distinct
      const allowed = new Set(['left', 'right', 'nod']);
      expect(allowed.has(res.body.steps[0])).toBe(true);
      expect(allowed.has(res.body.steps[1])).toBe(true);
      expect(res.body.steps[0]).not.toBe(res.body.steps[1]);
    });

    it('1.2 Enforces Single-Use Invariant: Same nonce cannot be used twice (Replay Protection)', async () => {
      // Create challenge
      const challengeRes = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001' });
      const nonce = challengeRes.body.nonce;

      const dummyProbe = generateSyntheticVector(101, 512);

      // First use: fails due to no appointment, but NONCE IS MARKED USED
      await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001', nonce, probe: dummyProbe });

      // Second use with same nonce -> 400 NONCE_ALREADY_USED
      const secondRes = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001', nonce, probe: dummyProbe });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error.code).toBe('NONCE_ALREADY_USED');
    });

    it('1.3 Rejects expired nonce', async () => {
      const expiredNonce = 'expired_nonce_1234567890abcdef1234567890abcdef';
      // Save expired challenge in repo directly
      await defaultKioskRepository.saveChallenge(
        expiredNonce,
        'kiosk-001',
        ['left', 'nod'],
        new Date(Date.now() - 5000) // Expired 5 seconds ago
      );

      const dummyProbe = generateSyntheticVector(102, 512);
      const res = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001', nonce: expiredNonce, probe: dummyProbe });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NONCE_EXPIRED');
    });
  });

  // =========================================================================
  // 2. CANDIDATE SET PRUNING & DoD 1
  // "คนที่ไม่ได้นัดวันนี้สแกนไม่ผ่าน"
  // =========================================================================
  describe('2. Candidate Set Pruning (DoD 1: No appointment today -> Scan Fails)', () => {
    it('2.1 DoD 1: Patient without an active appointment today fails face verification', async () => {
      // 1. Create Patient without any appointment
      const patientWithoutAppt = await defaultPatientRepository.createPatient(
        { first_name: 'สมชาย', last_name: 'ไม่มีนัดวันนี้' },
        'pt-001',
        'pt-001'
      );

      // Save face template for this patient
      const patientVector = generateSyntheticVector('patient-no-appt-seed', 512);
      await defaultKioskRepository.saveFaceTemplate(patientWithoutAppt.id, patientVector);

      // 2. Request challenge
      const chal = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001' });

      // 3. Attempt verification with Patient's exact face probe
      const res = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-001',
          nonce: chal.body.nonce,
          probe: patientVector,
        });

      // Must be rejected because patient is not in today's candidate set!
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('NO_APPOINTMENT_FOUND');
    });

    it('2.2 Patient with an active appointment today on this kiosk is admitted to candidate set', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayDate = new Date();
      const currentDayOfWeek = todayDate.getUTCDay();

      // 1. Create Patient A
      const patientA = await defaultPatientRepository.createPatient(
        { first_name: 'กานต์', last_name: 'มีนัดวันนี้' },
        'pt-001',
        'pt-001'
      );

      // 2. Create active course for Patient A matching today
      await defaultCourseRepository.createCourse(
        {
          patient_id: patientA.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-001',
        },
        'pt-001'
      );

      // 3. Register face template for Patient A
      const vectorA = generateSyntheticVector('patient-a-seed', 512);
      await defaultKioskRepository.saveFaceTemplate(patientA.id, vectorA);

      // 4. Request challenge
      const chal = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001' });

      // 5. Verify probe
      const res = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-001',
          nonce: chal.body.nonce,
          probe: vectorA,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.candidate.id).toBe(patientA.id);
      expect(res.body.candidate.first_name).toBe('กานต์');
    });
  });

  // =========================================================================
  // 3. DUAL CRITERIA MATCHING & DoD 2
  // "คนที่ 2 ผ่านเกณฑ์แต่ห่างอันดับ 1 ไม่พอถูกปฏิเสธ"
  // =========================================================================
  describe('3. Dual Criteria & Margin Requirement (DoD 2: Margin Delta below FACE_T_MARGIN -> Rejected)', () => {
    it('3.1 DoD 2: When candidate 2 meets accept threshold but score delta from candidate 1 is below FACE_T_MARGIN -> REJECTED', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const currentDayOfWeek = new Date().getUTCDay();

      // Create two patients both scheduled for today
      const p1 = await defaultPatientRepository.createPatient(
        { first_name: 'แฝดพี่', last_name: 'ตระกูลสถิตย์' },
        'pt-001',
        'pt-001'
      );
      const p2 = await defaultPatientRepository.createPatient(
        { first_name: 'แฝดน้อง', last_name: 'ตระกูลสถิตย์' },
        'pt-001',
        'pt-001'
      );

      await defaultCourseRepository.createCourse(
        {
          patient_id: p1.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-001',
        },
        'pt-001'
      );
      await defaultCourseRepository.createCourse(
        {
          patient_id: p2.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-001',
        },
        'pt-001'
      );

      // Base vector
      const baseVec = generateSyntheticVector('base-twin-vector', 512);

      // Template 1 = exactly baseVec (similarity with probe = 1.0)
      await defaultKioskRepository.saveFaceTemplate(p1.id, baseVec);

      // Template 2 = slight perturbation (e.g., blend 96% baseVec + 4% orthogonal)
      // Produces similarity ~0.96 with probe.
      // Delta = 1.0 - 0.96 = 0.04, which is strictly LESS than FACE_T_MARGIN (0.10)
      const orthogonal = generateSyntheticVector('orthogonal-vector', 512);
      const blended = baseVec.map((v, idx) => 0.96 * v + 0.04 * orthogonal[idx]);
      const normalizedBlended = l2Normalize(blended);
      await defaultKioskRepository.saveFaceTemplate(p2.id, normalizedBlended);

      // Challenge
      const chal = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001' });

      // Probe is baseVec
      const res = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-001',
          nonce: chal.body.nonce,
          probe: baseVec,
        });

      // Must be rejected with ambiguous match! (DoD 2)
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('FACE_VERIFY_AMBIGUOUS');
    });

    it('3.2 Succeeds when candidate 1 meets accept threshold and margin delta >= FACE_T_MARGIN', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const currentDayOfWeek = new Date().getUTCDay();

      const p1 = await defaultPatientRepository.createPatient(
        { first_name: 'สมศรี', last_name: 'มั่นใจเดี่ยว' },
        'pt-001',
        'pt-001'
      );
      const p2 = await defaultPatientRepository.createPatient(
        { first_name: 'สมรวย', last_name: 'คนละคนชัดเจน' },
        'pt-001',
        'pt-001'
      );

      await defaultCourseRepository.createCourse(
        {
          patient_id: p1.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-001',
        },
        'pt-001'
      );
      await defaultCourseRepository.createCourse(
        {
          patient_id: p2.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-001',
        },
        'pt-001'
      );

      const v1 = generateSyntheticVector('distinct-person-1', 512);
      const v2 = generateSyntheticVector('distinct-person-2', 512);

      await defaultKioskRepository.saveFaceTemplate(p1.id, v1);
      await defaultKioskRepository.saveFaceTemplate(p2.id, v2);

      const chal = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-001' });

      const res = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-001',
          nonce: chal.body.nonce,
          probe: v1,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.candidate.id).toBe(p1.id);
      expect(res.body.candidate.first_name).toBe('สมศรี');
    });
  });

  // =========================================================================
  // 4. LOCKOUT & AUTOMATIC STAFF CALL & DoD 3
  // "สแกนผิด 3 ครั้งสร้าง staff_call จริง"
  // =========================================================================
  describe('4. Automatic Staff Call on 3 Failed Scans (DoD 3)', () => {
    it('4.1 DoD 3: 3 consecutive failed verification attempts automatically creates staff_calls record and dispatches SSE', async () => {
      let receivedSseEvent: HospitalEvent | null = null;
      const sseListener = (evt: HospitalEvent) => {
        if (evt.event === 'staff_call') {
          receivedSseEvent = evt;
        }
      };
      hospitalEventBus.on('hospital_event', sseListener);

      const dummyProbe = generateSyntheticVector('random-failed-probe', 512);

      try {
        // Attempt 1: Fail
        const c1 = await request(app).post('/api/kiosk/challenge').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-002' });
        await request(app).post('/api/kiosk/verify').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-002', nonce: c1.body.nonce, probe: dummyProbe });
        expect(defaultKioskRepository.getFailedFaceAttempts('kiosk-002')).toBe(1);
        expect(defaultKioskRepository.getStaffCalls('kiosk-002').length).toBe(0);

        // Attempt 2: Fail
        const c2 = await request(app).post('/api/kiosk/challenge').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-002' });
        await request(app).post('/api/kiosk/verify').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-002', nonce: c2.body.nonce, probe: dummyProbe });
        expect(defaultKioskRepository.getFailedFaceAttempts('kiosk-002')).toBe(2);
        expect(defaultKioskRepository.getStaffCalls('kiosk-002').length).toBe(0);

        // Attempt 3: Fail -> Triggers staff call automatically (DoD 3)
        const c3 = await request(app).post('/api/kiosk/challenge').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-002' });
        await request(app).post('/api/kiosk/verify').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-002', nonce: c3.body.nonce, probe: dummyProbe });
        expect(defaultKioskRepository.getFailedFaceAttempts('kiosk-002')).toBe(3);

        // Assert a real record exists in staff_calls
        const staffCalls = defaultKioskRepository.getStaffCalls('kiosk-002');
        expect(staffCalls.length).toBeGreaterThanOrEqual(1);
        expect(staffCalls[0].kiosk_id).toBe('kiosk-002');
        expect(staffCalls[0].reason).toContain('Excessive failed face verification');

        // Assert SSE event was dispatched
        expect(receivedSseEvent).not.toBeNull();
        const capturedEvent = receivedSseEvent as unknown as HospitalEvent;
        expect(capturedEvent.event).toBe('staff_call');
        expect((capturedEvent.data as Record<string, unknown>).kiosk_id).toBe('kiosk-002');
      } finally {
        hospitalEventBus.off('hospital_event', sseListener);
      }
    });
  });

  // =========================================================================
  // 5. PRIVACY MINIMIZATION & IDENTITY CONFIRMATION
  // =========================================================================
  describe('5. Privacy Minimization & Identity Confirmation', () => {
    it('5.1 Successful verification returns ONLY first_name and signed avatar URL (NO HN, NO last_name)', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const currentDayOfWeek = new Date().getUTCDay();

      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'จิราภรณ์', last_name: 'ศรีสมุทรศักดิ์' },
        'pt-001',
        'pt-001'
      );

      await defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-003',
        },
        'pt-001'
      );

      const vec = generateSyntheticVector('privacy-test-vector', 512);
      await defaultKioskRepository.saveFaceTemplate(patient.id, vec);

      const chal = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-003' });

      const verifyRes = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-003',
          nonce: chal.body.nonce,
          probe: vec,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.candidate.first_name).toBe('จิราภรณ์');
      // Assert sensitive medical and personal data is NOT returned before confirmation!
      expect(verifyRes.body.candidate.last_name).toBeUndefined();
      expect(verifyRes.body.candidate.hn).toBeUndefined();
      expect(verifyRes.body.candidate.age).toBeUndefined();
      expect(verifyRes.body.candidate.history).toBeUndefined();
      expect(verifyRes.body.session_token).toBeDefined();

      // Confirm Identity: Returns full details
      const confirmRes = await request(app)
        .post('/api/kiosk/confirm-identity')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          session_token: verifyRes.body.session_token,
          confirmed: true,
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.confirmed).toBe(true);
      expect(confirmRes.body.patient.hn).toBe(patient.hn);
      expect(confirmRes.body.patient.first_name).toBe('จิราภรณ์');
      expect(confirmRes.body.patient.last_name).toBe('ศรีสมุทรศักดิ์');
    });

    it('5.2 When patient denies identity (confirmed: false), session is invalidated immediately', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const currentDayOfWeek = new Date().getUTCDay();

      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'กิตติ', last_name: 'วงศ์สว่าง' },
        'pt-001',
        'pt-001'
      );

      await defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [currentDayOfWeek],
          kiosk_id: 'kiosk-004',
        },
        'pt-001'
      );

      const vec = generateSyntheticVector('deny-identity-vector', 512);
      await defaultKioskRepository.saveFaceTemplate(patient.id, vec);

      const chal = await request(app)
        .post('/api/kiosk/challenge')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-004' });

      const verifyRes = await request(app)
        .post('/api/kiosk/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-004',
          nonce: chal.body.nonce,
          probe: vec,
        });

      const sessionToken = verifyRes.body.session_token;

      // Patient says "ไม่ใช่ฉัน" (confirmed: false)
      const denyRes = await request(app)
        .post('/api/kiosk/confirm-identity')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          session_token: sessionToken,
          confirmed: false,
        });

      expect(denyRes.status).toBe(200);
      expect(denyRes.body.confirmed).toBe(false);

      // Verify subsequent confirmation with invalidated token fails
      const retryRes = await request(app)
        .post('/api/kiosk/confirm-identity')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          session_token: sessionToken,
          confirmed: true,
        });
      expect(retryRes.status).toBe(401);
      expect(retryRes.body.error.code).toBe('INVALID_SESSION');
    });
  });

  // =========================================================================
  // 6. PACKAGES/FACE-CLIENT UNIT VERIFICATION
  // =========================================================================
  describe('6. Face Client Package Algorithms & Pipeline', () => {
    it('6.1 Vector normalization produces unit length (norm = 1.0)', () => {
      const raw = [3, 4];
      const norm = l2Normalize(raw);
      expect(norm[0]).toBeCloseTo(0.6, 5);
      expect(norm[1]).toBeCloseTo(0.8, 5);
      const len = Math.sqrt(norm[0] * norm[0] + norm[1] * norm[1]);
      expect(len).toBeCloseTo(1.0, 5);
    });

    it('6.2 Probe average and normalize produces unit vector across multiple frames', () => {
      const v1 = l2Normalize([1, 2, 3]);
      const v2 = l2Normalize([2, 3, 4]);
      const probe = averageAndNormalize([v1, v2]);
      const norm = Math.sqrt(probe.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('6.3 Cosine similarity between identical vectors is 1.0 and orthogonal vectors is 0.0', () => {
      const v1 = l2Normalize([1, 0, 0]);
      const v2 = l2Normalize([1, 0, 0]);
      const v3 = l2Normalize([0, 1, 0]);

      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
      expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5);
    });

    it('6.4 Quality Checker enforces single face and inter-ocular distance', () => {
      const checker = new FaceQualityChecker({ minIod: 40, stabilityMs: 0 });

      // No face
      const qNoFace = checker.checkQuality({ hasFace: false, multipleFaces: false, faceCount: 0, confidence: 0 });
      expect(qNoFace.passed).toBe(false);
      expect(qNoFace.issues).toContain('NO_FACE_DETECTED');

      // Multiple faces
      const qMultiFace = checker.checkQuality({ hasFace: true, multipleFaces: true, faceCount: 2, confidence: 0.9 });
      expect(qMultiFace.passed).toBe(false);
      expect(qMultiFace.issues).toContain('MULTIPLE_FACES_DETECTED');

      // Valid single face
      const qValid = checker.checkQuality({
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.99,
        landmarks: {
          leftEye: { x: 100, y: 100 },
          rightEye: { x: 160, y: 100 },
          noseTip: { x: 130, y: 130 },
          leftMouth: { x: 110, y: 160 },
          rightMouth: { x: 150, y: 160 },
        },
      });
      expect(qValid.passed).toBe(true);
      expect(qValid.iod).toBe(60);
    });

    it('6.5 FaceFlowManager executes complete verification sequence and wipes memory', async () => {
      const mockCamera = new CameraManager({ rotation: 0 });
      const mockDetector = new MockFaceDetector(0.99, 1);
      const mockAligner = new FaceAligner();
      const mockQuality = new FaceQualityChecker({ stabilityMs: 0 });
      const mockEmbedder = new MockEmbeddingModel(42);
      const mockPad = new MockPadProvider(true, 0.98);

      const dummyCanvas = {} as HTMLCanvasElement;

      const result = await FaceFlowManager.executeVerificationProbe(
        {
          kioskId: 'kiosk-flow-001',
          nonce: 'test-nonce-123',
          challengeSteps: ['left', 'nod'],
          camera: mockCamera,
          detector: mockDetector,
          aligner: mockAligner,
          qualityChecker: mockQuality,
          embeddingModel: mockEmbedder,
          padProvider: mockPad,
          requiredFramesCount: 3,
        },
        () => dummyCanvas
      );

      expect(result.probe.length).toBe(512);
      expect(result.liveness_score).toBe(0.98);
      expect(result.nonce).toBe('test-nonce-123');
    });
  });
});
