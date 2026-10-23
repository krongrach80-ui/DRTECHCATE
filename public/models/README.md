# Client-side Machine Learning Models & System 7 Status

> **ประกาศสำคัญ (Spec 7.1.3 & Item C3)**:  
> **ระบบ 7 (Face Embedding) ถูกบล็อก (Blocked) รอการตัดสินใจเรื่องโมเดล**  
> ยังไม่มีโมเดล Face Biometric Embedding 512 มิติที่ License ของ Weights และ Dataset ฝึกอนุญาตให้ใช้เชิงพาณิชย์และได้รับการยืนยันทางกฎหมาย  
> **ห้ามเพิ่ม Weights ใดๆ ของโมเดล Embedding เข้า Git Repository จนกว่าจะได้รับอนุมัติ**

---

### โมเดลที่ใช้งานได้ในปัจจุบัน (Non-Embedding):
1. **Liveness & Landmark Tracking (Active PAD)**:
   - `@mediapipe/tasks-vision` FaceLandmarker bundle (Apache-2.0 License)
   - ไฟล์: `face_landmarker.task`
   - ใช้สำหรับตรวจจับตำแหน่งใบหน้า หันศีรษะ 3 มิติ และกะพริบตาในโหมด Challenge-Response

### รายละเอียดการประเมินสิทธิ์และตัวเลือกโมเดล Embedding:
- ดูตารางวิเคราะห์ฉบับสมบูรณ์ใน [docs/MODEL_LICENSE_DECISION.md](../../docs/MODEL_LICENSE_DECISION.md)
