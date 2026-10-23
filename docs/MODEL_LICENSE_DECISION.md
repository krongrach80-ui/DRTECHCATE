# เอกสารการตัดสินใจเลือกโมเดลตรวจจับและแปลงเวกเตอร์ใบหน้า (Model License & Architecture Decision)

> **สถานะปัจจุบัน**: **ระบบ 7 (Face Embedding) ถูกบล็อก (Blocked) ชั่วคราว**  
> ตามสเปกข้อ 7.1.3: ยังไม่มีโมเดล Face Biometric Embedding 512 มิติใดที่ได้รับข้อยืนยันทางกฎหมายว่า License ของ Weights และชุดฝึก (Training Dataset) อนุญาตให้ใช้เชิงพาณิชย์ (Commercial Use) ได้โดยสมบูรณ์  
> **นโยบายความปลอดภัย**: ห้ามเพิ่ม Pre-trained Weights หรือ Shards ไฟล์น้ำหนักโมเดลใดๆ เข้าสู่ Git Repository จนกว่าจะได้รับมติเป็นลายลักษณ์อักษรจากผู้ใช้และฝ่ายกฎหมาย

---

## 1. ตารางเปรียบเทียบตัวเลือกโมเดล Face Embedding

| ลำดับ | ชื่อสถาปัตยกรรมโมเดล | มิติเวกเตอร์ (Dimension) | License ของ Weights | ชุดข้อมูลที่ใช้ฝึก (Training Dataset) | License ของชุดฝึก | ใช้เชิงพาณิชย์ได้หรือไม่ | สถานะการตรวจสอบ | หมายเหตุและการประเมิน |
|:---:|:---|:---:|:---:|:---|:---:|:---:|:---:|:---|
| 1 | **AdaFace (IR-50 / IR-101)** | 512 | MIT / Apache 2.0 (Code) | Glint360K / BUPT / CASIA-WebFace / MS1MV2 | Non-Commercial Research Only | **ไม่ได้ / เสี่ยงสูงมาก** | ตรวจสอบแล้ว | ตัวโค้ดเปิด แต่ weights ส่วนใหญ่เทรนบนชุดข้อมูลวิจัยที่ไม่ให้สิทธิ์เชิงพาณิชย์อย่างชัดเจน |
| 2 | **ArcFace (InsightFace - ResNet50/100)** | 512 | Non-Commercial License (InsightFace weights) | MS1MV2 / Glint360K | Research only | **ไม่ได้ (ห้ามเชิงพาณิชย์)** | ตรวจสอบแล้ว | InsightFace กำหนดเงื่อนไข Non-commercial ชัดเจนสำหรับ official weights |
| 3 | **EdgeFace (XS / S / M)** | 512 | Apache 2.0 | CASIA-WebFace หรือ Synthetic Faces (SynFace/DigiFace) | CASIA: Non-commercial / Synthetic: รอตรวจ | **ยังไม่ยืนยัน** | รอการตัดสินใจฝ่ายกฎหมาย | มีตัวแปรที่เทรนด้วย Synthetic Face data ซึ่งอาจเปิดช่องให้ใช้ได้ แต่ต้องตรวจเงื่อนไข data generator เพิ่มเติม |
| 4 | **Facenet (Inception-ResNet-v1)** | 512 | MIT | VGGFace2 / CASIA-WebFace | VGGFace2: Non-Commercial Research | **ไม่ได้ / เสี่ยงสูง** | ตรวจสอบแล้ว | VGGFace2 และ CASIA-WebFace กำหนดเงื่อนไขห้ามใช้เชิงพาณิชย์เด็ดขาด และ CASIA เป็นชุดวิจัยของสถาบันวิทยาศาสตร์จีน ไม่เปิดขายไลเซนส์เชิงพาณิชย์ทั่วไป |
| 5 | **MobileFaceNet (ONNX Custom Train)** | 512 | เปิดกว้าง (Train เอง) | พัฒนาหรือสังเคราะห์ชุดข้อมูลเอง (In-house / Clean Synthetic) | จัดหาหรือเทรนเองแบบ Commercial Clean | **ได้ (หากเทรนเอง)** | ทางเลือกแนะนำระยะยาว | ต้องลงทุนเทรนโมเดล MobileFaceNet 512-dim ด้วยตนเองบน Clean Dataset เพื่อความปลอดภัยทางกฎหมาย 100% |
| 6 | **@vladmandic/face-api (MobileNetv1)** | **128** *(ไม่ตรงสเปก)* | MIT | VGGFace (ย่อส่วน) | Non-commercial research | **ตกคุณสมบัติ** | ตรวจสอบแล้ว | **ให้ embedding เพียง 128 มิติ ซึ่งไม่ตรงกับสเปก 512 มิติ และ pgvector schema ของระบบ จึงห้ามนำมาอ้างเป็นตัวเลือก** |

---

## 2. ประเด็นสำคัญทางกฎหมาย (Legal Observations)

1. **CASIA-WebFace ไม่ใช่ทางออกเชิงพาณิชย์**:
   - CASIA-WebFace เผยแพร่โดย Institute of Automation, Chinese Academy of Sciences (CASIA) เพื่อประโยชน์ในการศึกษาวิจัยทางวิชาการเท่านั้น (Academic Non-Commercial Research License)
   - ไม่มีการจำหน่ายหรือเปิดให้ซื้อลิขสิทธิ์เชิงพาณิชย์ (No commercial license purchase option) การแนะนำให้ซื้อสิทธิ์จึงเป็นข้อมูลที่ผิดพลาดและได้ถูกเพิกถอนออกจากรายงานแล้ว

2. **ปัญหา "Data Poisoning" ในมุมมองลิขสิทธิ์**:
   - แม้ตัวสถาปัตยกรรมโมเดลและโค้ดจะเป็น Open-Source (เช่น MIT, Apache-2.0) แต่น้ำหนักของโมเดล (Weights) ได้รับการถ่ายทอดสิทธิมาจากชุดข้อมูลที่ใช้ฝึก หากชุดข้อมูลระบุ "Non-Commercial Use Only" การนำ Weights นั้นไปใช้ในระบบโรงพยาบาลหรือเชิงพาณิชย์ถือเป็นความเสี่ยงทางกฎหมายด้านละเมิดลิขสิทธิ์

3. **ข้อกำหนด MediaPipe Tasks Vision**:
   - โมเดลตรวจจับใบหน้าและ Landmark 468/478 จุด (`face_landmarker.task`) ของ Google MediaPipe เป็น Apache 2.0 อนุญาตให้ใช้เชิงพาณิชย์ได้สำหรับการตรวจจับพิกัดใบหน้า (Face Mesh & Active PAD Tracking)
   - ปัญหาติดขัดจำกัดอยู่เฉพาะโมเดล **Biometric Embedding 512 มิติ** สำหรับจดจำและยืนยันตัวตนคนไข้เท่านั้น

---

## 3. มติที่ต้องให้ผู้ว่าจ้าง / ฝ่ายกฎหมายตัดสินใจ

1. **ทางเลือก ก (แนะนำสำหรับ Production ปลอดภัยสูงสุด)**:
   - อนุมัติงบประมาณและทรัพยากรเพื่อ **Fine-tune / Train โมเดล MobileFaceNet (512-dim)** บนชุดข้อมูลที่มี Commercial-Clean License หรือ Synthetic Face Dataset ที่ถูกกฎหมาย
2. **ทางเลือก ข (จัดซื้อสิทธิ์จาก Vendor)**:
   - จัดซื้อโมเดลสำเร็จรูปที่มี Commercial License ครบวงจรจากผู้ให้บริการโมเดลตรวจจับใบหน้าเชิงพาณิชย์ที่รับประกันการฟ้องร้อง (Indemnification)
3. **ทางเลือก ค (อนุโลมใช้ชั่วคราวในวงปิด Sandbox โรงพยาบาล)**:
   - อนุญาตให้นำ Pre-trained Model ทดสอบในสภาพแวดล้อม Closed Pilot/Clinical Trial ที่ไม่ใช่การแสวงหากำไรเชิงพาณิชย์ จนกว่าจะได้โมเดลจริง
