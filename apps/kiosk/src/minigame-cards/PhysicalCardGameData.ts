/**
 * apps/kiosk/src/minigame-cards/PhysicalCardGameData.ts
 * คลังโจทย์มินิเกม "การ์ดกายภาพ" ครบทั้ง 99 ข้อ
 * แยกเป็นอิสระ ไม่กระทบระบบอื่น
 */

export interface PhysicalCardQuestion {
  id: string;
  imageDescription: string;
  prompt: string;
  correctAnswer: 'yes' | 'no';
  category: 'อาหาร & ผลไม้' | 'สิ่งของเครื่องใช้' | 'สัตว์ & ธรรมชาติ' | 'การนับจำนวน' | 'ความปลอดภัย & กิจวัตร' | 'สี รูปทรง & เวลา' | 'ตำแหน่ง & มโนทัศน์';
  iconEmoji: string;
  visualKey: string;
  explanation: string;
}

export const ALL_99_PHYSICAL_CARD_QUESTIONS: PhysicalCardQuestion[] = [
  // 1-25: วัตถุสิ่งของ ผลไม้ และสัตว์พื้นฐาน
  {
    id: 'pcg-01',
    imageDescription: 'กล้วย',
    prompt: 'กล้วยเป็นผลไม้ไหม?',
    correctAnswer: 'yes',
    category: 'อาหาร & ผลไม้',
    iconEmoji: '🍌',
    visualKey: 'banana',
    explanation: 'ใช่ กล้วยเป็นผลไม้ที่ให้พลังงานและโพแทสเซียมสูง',
  },
  {
    id: 'pcg-02',
    imageDescription: 'ส้ม',
    prompt: 'ในภาพเป็นกล้วยไหม?',
    correctAnswer: 'no',
    category: 'อาหาร & ผลไม้',
    iconEmoji: '🍊',
    visualKey: 'orange',
    explanation: 'ไม่ใช่ ในภาพคือผลส้ม ไม่ใช่กล้วย',
  },
  {
    id: 'pcg-03',
    imageDescription: 'จานข้าว',
    prompt: 'ข้าวเป็นอาหารไหม?',
    correctAnswer: 'yes',
    category: 'อาหาร & ผลไม้',
    iconEmoji: '🍚',
    visualKey: 'rice-plate',
    explanation: 'ใช่ ข้าวเป็นอาหารหลักที่ให้คาร์โบไฮเดรต',
  },
  {
    id: 'pcg-04',
    imageDescription: 'ช้อน',
    prompt: 'ช้อนใช้ตักอาหารไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🥄',
    visualKey: 'spoon',
    explanation: 'ใช่ ช้อนใช้สำหรับตักอาหารและของเหลว',
  },
  {
    id: 'pcg-05',
    imageDescription: 'ส้อม',
    prompt: 'ในภาพเป็นช้อนไหม?',
    correctAnswer: 'no',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🍴',
    visualKey: 'fork',
    explanation: 'ไม่ใช่ ในภาพคือส้อมสำหรับจิ้มอาหาร',
  },
  {
    id: 'pcg-06',
    imageDescription: 'แก้วน้ำ',
    prompt: 'แก้วใช้ใส่น้ำไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🥛',
    visualKey: 'water-glass',
    explanation: 'ใช่ แก้วน้ำเป็นภาชนะใช้บรรจุเครื่องดื่ม',
  },
  {
    id: 'pcg-07',
    imageDescription: 'แก้วเปล่า',
    prompt: 'ในแก้วมีน้ำไหม?',
    correctAnswer: 'no',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🥛',
    visualKey: 'empty-glass',
    explanation: 'ไม่ใช่ ในแก้วนี้ว่างเปล่าไม่มีน้ำ',
  },
  {
    id: 'pcg-08',
    imageDescription: 'หมอน',
    prompt: 'หมอนใช้หนุนศีรษะไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🛏️',
    visualKey: 'pillow',
    explanation: 'ใช่ หมอนใช้รองรับศีรษะและลำคอขณะนอนหลับ',
  },
  {
    id: 'pcg-09',
    imageDescription: 'รองเท้า',
    prompt: 'รองเท้าใส่ที่เท้าไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '👟',
    visualKey: 'shoes',
    explanation: 'ใช่ รองเท้าใช้สวมใส่ที่เท้าเพื่อป้องกันการบาดเจ็บ',
  },
  {
    id: 'pcg-10',
    imageDescription: 'หมวก',
    prompt: 'หมวกใส่บนศีรษะไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🧢',
    visualKey: 'hat',
    explanation: 'ใช่ หมวกใช้สวมบนศีรษะเพื่อกันแดดหรือให้ความอบอุ่น',
  },
  {
    id: 'pcg-11',
    imageDescription: 'แปรงสีฟัน',
    prompt: 'ใช้แปรงสีฟันแปรงฟันไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🪥',
    visualKey: 'toothbrush',
    explanation: 'ใช่ แปรงสีฟันใช้ทำความสะอาดฟันและช่องปาก',
  },
  {
    id: 'pcg-12',
    imageDescription: 'หวี',
    prompt: 'ในภาพเป็นแปรงสีฟันไหม?',
    correctAnswer: 'no',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🪮',
    visualKey: 'comb',
    explanation: 'ไม่ใช่ ในภาพคือหวีสำหรับจัดแต่งทรงผม',
  },
  {
    id: 'pcg-13',
    imageDescription: 'นาฬิกา',
    prompt: 'นาฬิกาใช้ดูเวลาไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '⏰',
    visualKey: 'clock',
    explanation: 'ใช่ นาฬิกาใช้บอกเวลาชั่วโมงและนาที',
  },
  {
    id: 'pcg-14',
    imageDescription: 'กุญแจ',
    prompt: 'กุญแจใช้เปิดประตูไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🔑',
    visualKey: 'key',
    explanation: 'ใช่ กุญแจใช้สำหรับล็อกและไขเปิดประตู',
  },
  {
    id: 'pcg-15',
    imageDescription: 'ร่ม',
    prompt: 'ร่มช่วยกันฝนไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '☂️',
    visualKey: 'umbrella',
    explanation: 'ใช่ ร่มช่วยป้องกันละอองฝนและแสงแดด',
  },
  {
    id: 'pcg-16',
    imageDescription: 'พัดลม',
    prompt: 'พัดลมช่วยให้มีลมไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🪭',
    visualKey: 'fan',
    explanation: 'ใช่ ใบพัดของพัดลมหมุนสร้างกระแสลมระบายความร้อน',
  },
  {
    id: 'pcg-17',
    imageDescription: 'สบู่',
    prompt: 'สบู่ใช้ล้างมือไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🧼',
    visualKey: 'soap',
    explanation: 'ใช่ สบู่ช่วยชะล้างสิ่งสกปรกและเชื้อโรคออกจากมือ',
  },
  {
    id: 'pcg-18',
    imageDescription: 'ผ้าเช็ดตัว',
    prompt: 'ใช้ผ้านี้เช็ดตัวได้ไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🧖',
    visualKey: 'towel',
    explanation: 'ใช่ ผ้าเช็ดตัวมีคุณสมบัติซับน้ำ เช็ดตัวให้แห้ง',
  },
  {
    id: 'pcg-19',
    imageDescription: 'ไม้กวาด',
    prompt: 'ไม้กวาดใช้กวาดพื้นไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🧹',
    visualKey: 'broom',
    explanation: 'ใช่ ไม้กวาดใช้ทำความสะอาดกวาดฝุ่นละอองบนพื้น',
  },
  {
    id: 'pcg-20',
    imageDescription: 'กระจก',
    prompt: 'กระจกช่วยให้เห็นหน้าตัวเองไหม?',
    correctAnswer: 'yes',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🪞',
    visualKey: 'mirror',
    explanation: 'ใช่ ผิวสะท้อนของกระจกเงาช่วยให้มองเห็นใบหน้าตนเอง',
  },
  {
    id: 'pcg-21',
    imageDescription: 'กล่องนม',
    prompt: 'นมดื่มได้ไหม?',
    correctAnswer: 'yes',
    category: 'อาหาร & ผลไม้',
    iconEmoji: '🥛',
    visualKey: 'milk-box',
    explanation: 'ใช่ นมเป็นเครื่องดื่มที่มีแคลเซียมและโปรตีนสูง',
  },
  {
    id: 'pcg-22',
    imageDescription: 'ปลา',
    prompt: 'ปลาในภาพมีปีกไหม?',
    correctAnswer: 'no',
    category: 'สัตว์ & ธรรมชาติ',
    iconEmoji: '🐟',
    visualKey: 'fish',
    explanation: 'ไม่ใช่ ปลาทั่วไปมีครีบและหางสำหรับว่ายน้ำ ไม่มีปีก',
  },
  {
    id: 'pcg-23',
    imageDescription: 'แมว',
    prompt: 'แมวมีสี่ขาไหม?',
    correctAnswer: 'yes',
    category: 'สัตว์ & ธรรมชาติ',
    iconEmoji: '🐱',
    visualKey: 'cat',
    explanation: 'ใช่ แมวเป็นสัตว์สี่เท้า (ขาหน้า 2 ขา ขาหลัง 2 ขา)',
  },
  {
    id: 'pcg-24',
    imageDescription: 'สุนัข',
    prompt: 'ในภาพเป็นแมวไหม?',
    correctAnswer: 'no',
    category: 'สัตว์ & ธรรมชาติ',
    iconEmoji: '🐶',
    visualKey: 'dog',
    explanation: 'ไม่ใช่ สัตว์ในภาพคือสุนัข (หมา) ไม่ใช่แมว',
  },
  {
    id: 'pcg-25',
    imageDescription: 'ช้าง',
    prompt: 'ช้างมีงวงไหม?',
    correctAnswer: 'yes',
    category: 'สัตว์ & ธรรมชาติ',
    iconEmoji: '🐘',
    visualKey: 'elephant',
    explanation: 'ใช่ ช้างมีงวงยาวที่ใช้ดมกลิ่น จับสิ่งของ และพ่นน้ำ',
  },

  // 26-50: การสังเกตและการนับจำนวน (Counting & Observation)
  {
    id: 'pcg-26',
    imageDescription: 'แอปเปิล 1 ลูก',
    prompt: 'มีแอปเปิล 1 ลูกไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🍎',
    visualKey: 'apple-1',
    explanation: 'ใช่ ในภาพมีแอปเปิลสีแดงจำนวน 1 ลูกถ้วน',
  },
  {
    id: 'pcg-27',
    imageDescription: 'แอปเปิล 2 ลูก',
    prompt: 'มีแอปเปิล 3 ลูกไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🍎',
    visualKey: 'apple-2',
    explanation: 'ไม่ใช่ ในภาพมีแอปเปิลเพียง 2 ลูก ไม่ใช่ 3 ลูก',
  },
  {
    id: 'pcg-28',
    imageDescription: 'กล้วย 3 ลูก',
    prompt: 'มีกล้วย 3 ลูกไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🍌',
    visualKey: 'banana-3',
    explanation: 'ใช่ เมื่อนับดูแล้วมีผลกล้วยครบ 3 ลูก',
  },
  {
    id: 'pcg-29',
    imageDescription: 'กล้วย 2 ลูก',
    prompt: 'มีกล้วย 3 ลูกไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🍌',
    visualKey: 'banana-2',
    explanation: 'ไม่ใช่ ในภาพมีกล้วยเพียง 2 ลูก',
  },
  {
    id: 'pcg-30',
    imageDescription: 'แก้ว 2 ใบ',
    prompt: 'มีแก้ว 2 ใบไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🥛',
    visualKey: 'glass-2',
    explanation: 'ใช่ มีแก้ววางอยู่ 2 ใบพอดี',
  },
  {
    id: 'pcg-31',
    imageDescription: 'แก้ว 1 ใบ',
    prompt: 'มีแก้ว 2 ใบไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🥛',
    visualKey: 'glass-1',
    explanation: 'ไม่ใช่ ในภาพมีแก้วเพียง 1 ใบเท่านั้น',
  },
  {
    id: 'pcg-32',
    imageDescription: 'ดอกไม้ 2 ดอก',
    prompt: 'มีดอกไม้ 2 ดอกไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🌸',
    visualKey: 'flower-2',
    explanation: 'ใช่ มีดอกไม้บานสวยงาม 2 ดอก',
  },
  {
    id: 'pcg-33',
    imageDescription: 'ดอกไม้ 3 ดอก',
    prompt: 'มีดอกไม้ 2 ดอกไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🌸',
    visualKey: 'flower-3',
    explanation: 'ไม่ใช่ ในภาพมีดอกไม้ 3 ดอก ไม่ใช่ 2 ดอก',
  },
  {
    id: 'pcg-34',
    imageDescription: 'ถุงเท้า 2 ข้าง',
    prompt: 'เป็นถุงเท้าครบ 1 คู่ไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🧦',
    visualKey: 'socks-2',
    explanation: 'ใช่ ถุงเท้า 2 ข้างรวมกันเป็น 1 คู่พอดี',
  },
  {
    id: 'pcg-35',
    imageDescription: 'ถุงเท้า 1 ข้าง',
    prompt: 'เป็นถุงเท้าครบ 1 คู่ไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🧦',
    visualKey: 'sock-1',
    explanation: 'ไม่ใช่ ถุงเท้ามีเพียงข้างเดียว ขาดอีกข้างจึงไม่ครบ 1 คู่',
  },
  {
    id: 'pcg-36',
    imageDescription: 'ไข่ 3 ฟอง',
    prompt: 'มีไข่ 3 ฟองไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🥚',
    visualKey: 'egg-3',
    explanation: 'ใช่ ในภาพมีฟองไข่จำนวน 3 ฟอง',
  },
  {
    id: 'pcg-37',
    imageDescription: 'ไข่ 2 ฟอง',
    prompt: 'มีไข่ 3 ฟองไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🥚',
    visualKey: 'egg-2',
    explanation: 'ไม่ใช่ ในภาพมีไข่เพียง 2 ฟอง',
  },
  {
    id: 'pcg-38',
    imageDescription: 'เก้าอี้ 2 ตัว',
    prompt: 'มีเก้าอี้ 2 ตัวไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🪑',
    visualKey: 'chair-2',
    explanation: 'ใช่ มีเก้าอี้ตั้งอยู่ 2 ตัว',
  },
  {
    id: 'pcg-39',
    imageDescription: 'เก้าอี้ 1 ตัว',
    prompt: 'มีเก้าอี้ 2 ตัวไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🪑',
    visualKey: 'chair-1',
    explanation: 'ไม่ใช่ ในภาพมีเก้าอี้เพียงตัวเดียว',
  },
  {
    id: 'pcg-40',
    imageDescription: 'ช้อน 3 คัน',
    prompt: 'มีช้อน 3 คันไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🥄',
    visualKey: 'spoon-3',
    explanation: 'ใช่ ในภาพมีช้อนวางเรียงอยู่ 3 คัน',
  },
  {
    id: 'pcg-41',
    imageDescription: 'ช้อน 2 คัน',
    prompt: 'มีช้อน 3 คันไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🥄',
    visualKey: 'spoon-2',
    explanation: 'ไม่ใช่ ในภาพมีช้อนเพียง 2 คัน',
  },
  {
    id: 'pcg-42',
    imageDescription: 'ส้ม 2 ผล',
    prompt: 'มีส้ม 2 ผลไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🍊',
    visualKey: 'orange-2',
    explanation: 'ใช่ มีส้มอยู่ 2 ผล',
  },
  {
    id: 'pcg-43',
    imageDescription: 'ส้ม 4 ผล',
    prompt: 'มีส้ม 2 ผลไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🍊',
    visualKey: 'orange-4',
    explanation: 'ไม่ใช่ ในภาพมีส้มถึง 4 ผล ไม่ใช่ 2 ผล',
  },
  {
    id: 'pcg-44',
    imageDescription: 'ลูกบอล 1 ลูก',
    prompt: 'มีลูกบอล 1 ลูกไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '⚽',
    visualKey: 'ball-1',
    explanation: 'ใช่ มีลูกบอลกลมจำนวน 1 ลูก',
  },
  {
    id: 'pcg-45',
    imageDescription: 'ลูกบอล 3 ลูก',
    prompt: 'มีลูกบอล 2 ลูกไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '⚽',
    visualKey: 'ball-3',
    explanation: 'ไม่ใช่ ในภาพมีลูกบอล 3 ลูก ไม่ใช่ 2 ลูก',
  },
  {
    id: 'pcg-46',
    imageDescription: 'เทียนบนเค้ก 2 เล่ม',
    prompt: 'มีเทียน 2 เล่มไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🎂',
    visualKey: 'candle-cake-2',
    explanation: 'ใช่ บนเค้กปักเทียนไว้ 2 เล่ม',
  },
  {
    id: 'pcg-47',
    imageDescription: 'เทียนบนเค้ก 1 เล่ม',
    prompt: 'มีเทียน 2 เล่มไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🎂',
    visualKey: 'candle-cake-1',
    explanation: 'ไม่ใช่ บนเค้กมีเทียนเพียง 1 เล่ม',
  },
  {
    id: 'pcg-48',
    imageDescription: 'จาน 3 ใบ',
    prompt: 'มีจาน 3 ใบไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '🍽️',
    visualKey: 'plate-3',
    explanation: 'ใช่ มีจานวางซ้อนหรือเรียงกันอยู่ 3 ใบ',
  },
  {
    id: 'pcg-49',
    imageDescription: 'จาน 2 ใบ',
    prompt: 'มีจาน 3 ใบไหม?',
    correctAnswer: 'no',
    category: 'การนับจำนวน',
    iconEmoji: '🍽️',
    visualKey: 'plate-2',
    explanation: 'ไม่ใช่ ในภาพมีจานเพียง 2 ใบ',
  },
  {
    id: 'pcg-50',
    imageDescription: 'รองเท้า 2 ข้าง',
    prompt: 'มีรองเท้าครบ 1 คู่ไหม?',
    correctAnswer: 'yes',
    category: 'การนับจำนวน',
    iconEmoji: '👞',
    visualKey: 'shoes-2',
    explanation: 'ใช่ รองเท้าข้างซ้ายและขวารวมเป็น 1 คู่พอดี',
  },

  // 51-74: สุขอนามัย การตัดสินใจและความปลอดภัยในชีวิตประจำวัน (Safety & Life Skills)
  {
    id: 'pcg-51',
    imageDescription: 'คนกำลังล้างมือ',
    prompt: 'ก่อนกินข้าวควรล้างมือไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🧼',
    visualKey: 'wash-hands',
    explanation: 'ใช่ การล้างมือช่วยกำจัดเชื้อโรคก่อนสัมผัสอาหาร',
  },
  {
    id: 'pcg-52',
    imageDescription: 'มือเปื้อนดินกับขนม',
    prompt: 'ควรกินขนมทันทีไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🍪',
    visualKey: 'dirty-hands-snack',
    explanation: 'ไม่ควร ต้องล้างมือให้สะอาดก่อนกินขนม เพื่อป้องกันเชื้อโรค',
  },
  {
    id: 'pcg-53',
    imageDescription: 'ซุปร้อนมีไอน้ำ',
    prompt: 'ควรล้างหรือรอให้เย็นก่อนกินไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🍲',
    visualKey: 'hot-soup',
    explanation: 'ใช่ ควรรอให้อาหารคลายความร้อนก่อนกินเพื่อไม่ให้ลวกปาก',
  },
  {
    id: 'pcg-54',
    imageDescription: 'อาหารขึ้นรา',
    prompt: 'ควรกินอาหารนี้ไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🍞',
    visualKey: 'moldy-food',
    explanation: 'ไม่ควรกิน อาหารขึ้นรามีสารพิษและเชื้อราที่เป็นอันตรายต่อสุขภาพ',
  },
  {
    id: 'pcg-55',
    imageDescription: 'แอปเปิลที่ล้างแล้ว',
    prompt: 'กินได้ไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🍎',
    visualKey: 'clean-apple',
    explanation: 'ใช่ ผลไม้ที่ล้างน้ำสะอาดแล้ว ปลอดภัยพร้อมรับประทาน',
  },
  {
    id: 'pcg-56',
    imageDescription: 'ร่มหุบกลางฝน',
    prompt: 'ร่มที่หุบอยู่ช่วยกันฝนไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '☂️',
    visualKey: 'closed-umbrella-rain',
    explanation: 'ไม่ใช่ ถ้าร่มหุบอยู่จะไม่สามารถบังหยดน้ำฝนได้ ต้องกางร่มออก',
  },
  {
    id: 'pcg-57',
    imageDescription: 'คนสวมหมวกกลางแดด',
    prompt: 'หมวกช่วยบังแดดไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🧢',
    visualKey: 'hat-sun',
    explanation: 'ใช่ ปีกหมวกช่วยบังแสงแดดไม่ให้ส่องใบหน้าและดวงตา',
  },
  {
    id: 'pcg-58',
    imageDescription: 'คนจับราวบันได',
    prompt: 'ราวช่วยพยุงตัวไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🪜',
    visualKey: 'handrail',
    explanation: 'ใช่ การจับราวบันไดช่วยพยุงการทรงตัวและป้องกันการพลัดตกหกล้ม',
  },
  {
    id: 'pcg-59',
    imageDescription: 'เก้าอี้ขาหัก',
    prompt: 'ควรนั่งเก้าอี้ตัวนี้ไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🪑',
    visualKey: 'broken-chair',
    explanation: 'ไม่ควรนั่ง เก้าอี้ขาชำรุดอาจพังลงมาทำให้ได้รับบาดเจ็บ',
  },
  {
    id: 'pcg-60',
    imageDescription: 'คนกำลังนั่งพัก',
    prompt: 'การนั่งพักช่วยให้ได้พักเหนื่อยไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🪑',
    visualKey: 'person-resting',
    explanation: 'ใช่ การนั่งพักผ่อนช่วยฟื้นฟูพลังงานและลดอัตราการเต้นของหัวใจ',
  },
  {
    id: 'pcg-61',
    imageDescription: 'เตาแก๊สเปิดกับคนกำลังออกจากบ้าน',
    prompt: 'ควรเปิดเตาทิ้งไว้ไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🔥',
    visualKey: 'gas-stove-on',
    explanation: 'ไม่ควรอย่างยิ่ง ต้องปิดเตาแก๊สให้สนิทก่อนออกจากบ้านเพื่อกันอัคคีภัย',
  },
  {
    id: 'pcg-62',
    imageDescription: 'โคมไฟในห้องมืด',
    prompt: 'เปิดไฟแล้วห้องสว่างขึ้นไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '💡',
    visualKey: 'lamp-dark',
    explanation: 'ใช่ การเปิดไฟทำให้เกิดแสงสว่าง ช่วยให้มองเห็นสิ่งต่างๆ ชัดเจน',
  },
  {
    id: 'pcg-63',
    imageDescription: 'ของวางขวางทางเดิน',
    prompt: 'ควรรีบเดินผ่านไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '📦',
    visualKey: 'obstacle-walkway',
    explanation: 'ไม่ควรรีบเดิน ควรเก็บของให้พ้นทางหรือเดินเลี่ยงอย่างระมัดระวัง',
  },
  {
    id: 'pcg-64',
    imageDescription: 'ไฟจราจรสีแดง',
    prompt: 'ข้ามถนนตอนนี้ได้ไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🛑',
    visualKey: 'red-traffic-light',
    explanation: 'ไม่ได้ สัญญาณไฟสีแดงหมายถึงหยุด ต้องรอจนกว่าจะได้สัญญาณคนข้ามสีเขียว',
  },
  {
    id: 'pcg-65',
    imageDescription: 'สัญญาณคนข้ามสีเขียว',
    prompt: 'ควรมองรถก่อนข้ามไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🟢',
    visualKey: 'green-crossing-light',
    explanation: 'ใช่ แม้ไฟเขียวก็ควรมองซ้ายขวาให้แน่ใจว่ารถหยุดสนิทก่อนข้าม',
  },
  {
    id: 'pcg-66',
    imageDescription: 'ผ้าตากกลางฝน',
    prompt: 'ผ้าจะแห้งไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🌧️',
    visualKey: 'clothes-rain',
    explanation: 'ไม่แห้ง ฝนตกจะทำให้ผ้าเปียกชื้นยิ่งขึ้น ต้องเก็บเข้าที่ร่ม',
  },
  {
    id: 'pcg-67',
    imageDescription: 'ผ้าตากกลางแดด',
    prompt: 'ผ้าเปียกจะแห้งได้ไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '☀️',
    visualKey: 'clothes-sun',
    explanation: 'ใช่ ความร้อนและแสงแดดช่วยระเหยน้ำทำให้ผ้าแห้งสนิท',
  },
  {
    id: 'pcg-68',
    imageDescription: 'คนยืนใต้ต้นไม้ตอนฟ้าร้อง',
    prompt: 'เป็นที่หลบฝนที่ปลอดภัยไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '⚡',
    visualKey: 'tree-thunder',
    explanation: 'ไม่ปลอดภัย การอยู่ใต้ต้นไม้ใหญ่ตอนมีฟ้าคะนองเสี่ยงต่อการถูกฟ้าผ่า',
  },
  {
    id: 'pcg-69',
    imageDescription: 'ต้นไม้ในกระถางกับบัวรดน้ำ',
    prompt: 'ต้นไม้ต้องการน้ำไหม?',
    correctAnswer: 'yes',
    category: 'สัตว์ & ธรรมชาติ',
    iconEmoji: '🪴',
    visualKey: 'plant-watering-can',
    explanation: 'ใช่ ต้นไม้ต้องการน้ำและแสงแดดเพื่อการเจริญเติบโต',
  },
  {
    id: 'pcg-70',
    imageDescription: 'ต้นไม้พลาสติก',
    prompt: 'ต้องรดน้ำไหม?',
    correctAnswer: 'no',
    category: 'สิ่งของเครื่องใช้',
    iconEmoji: '🎍',
    visualKey: 'plastic-plant',
    explanation: 'ไม่ต้องรดน้ำ ต้นไม้พลาสติกเป็นสิ่งของตกแต่ง ไม่ใช่สิ่งมีชีวิต',
  },
  {
    id: 'pcg-71',
    imageDescription: 'คนกางร่มกันแดด',
    prompt: 'ร่มช่วยบังแดดได้ไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '☂️',
    visualKey: 'sun-umbrella',
    explanation: 'ใช่ ผ้าร่มช่วยสะท้อนรังสีความร้อนและกำบังแสงแดดได้',
  },
  {
    id: 'pcg-72',
    imageDescription: 'คนรับโทรศัพท์จากคนแปลกหน้า',
    prompt: 'ควรบอกรหัสธนาคารไหม?',
    correctAnswer: 'no',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '📞',
    visualKey: 'phone-bank-code',
    explanation: 'ห้ามบอกเด็ดขาด รหัสผ่านและรหัสธนาคารเป็นความลับ ห้ามเปิดเผยแก่คนแปลกหน้า',
  },
  {
    id: 'pcg-73',
    imageDescription: 'คนมองตาแมวก่อนเปิดประตู',
    prompt: 'ควรดูก่อนว่าใครมาไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '🚪',
    visualKey: 'peephole',
    explanation: 'ใช่ ควรตรวจสอบให้แน่ใจว่าเป็นคนที่รู้จักและปลอดภัยก่อนเปิดประตูรับ',
  },
  {
    id: 'pcg-74',
    imageDescription: 'คนจ่ายเงินที่ร้านค้า',
    prompt: 'ต้องจ่ายเงินก่อนรับของไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '💵',
    visualKey: 'store-pay',
    explanation: 'ใช่ การซื้อสินค้าต้องชำระค่าสินค้าตามกฎระเบียบของร้าน',
  },

  // 75-86: สี รูปทรง เวลา และตัวเลข (Colors, Shapes, Time & Numbers)
  {
    id: 'pcg-75',
    imageDescription: 'นาฬิกาชี้เลข 7',
    prompt: 'เข็มชี้เลข 7 ไหม?',
    correctAnswer: 'yes',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '⏰',
    visualKey: 'clock-7',
    explanation: 'ใช่ เข็มสั้นชี้ตรงตำแหน่งเลข 7 พอดี',
  },
  {
    id: 'pcg-76',
    imageDescription: 'นาฬิกาชี้เลข 3',
    prompt: 'เข็มชี้เลข 7 ไหม?',
    correctAnswer: 'no',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '⏰',
    visualKey: 'clock-3',
    explanation: 'ไม่ใช่ เข็มชี้ที่เลข 3 ไม่ใช่เลข 7',
  },
  {
    id: 'pcg-77',
    imageDescription: 'ปฏิทินวันที่ 1',
    prompt: 'วันนี้วันที่ 1 ไหม?',
    correctAnswer: 'yes',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '📅',
    visualKey: 'calendar-1',
    explanation: 'ใช่ บนปฏิทินแสดงตัวเลขวันที่ 1',
  },
  {
    id: 'pcg-78',
    imageDescription: 'ปฏิทินวันที่ 2',
    prompt: 'วันนี้วันที่ 1 ไหม?',
    correctAnswer: 'no',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '📅',
    visualKey: 'calendar-2',
    explanation: 'ไม่ใช่ บนหน้าปฏิทินแสดงตัวเลขวันที่ 2',
  },
  {
    id: 'pcg-79',
    imageDescription: 'แอปเปิลสีแดง',
    prompt: 'แอปเปิลในภาพสีแดงไหม?',
    correctAnswer: 'yes',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '🍎',
    visualKey: 'apple-red',
    explanation: 'ใช่ ผลแอปเปิลมีเปลือกสีแดงสดใส',
  },
  {
    id: 'pcg-80',
    imageDescription: 'แอปเปิลสีเขียว',
    prompt: 'แอปเปิลในภาพสีแดงไหม?',
    correctAnswer: 'no',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '🍏',
    visualKey: 'apple-green',
    explanation: 'ไม่ใช่ แอปเปิลในภาพนี้เป็นสีเขียว ไม่ใช่สีแดง',
  },
  {
    id: 'pcg-81',
    imageDescription: 'กล้วยสีเหลือง',
    prompt: 'กล้วยในภาพสีเหลืองไหม?',
    correctAnswer: 'yes',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '🍌',
    visualKey: 'banana-yellow',
    explanation: 'ใช่ กล้วยสุกในภาพมีเปลือกสีเหลืองทอง',
  },
  {
    id: 'pcg-82',
    imageDescription: 'ลูกบอลสีฟ้า',
    prompt: 'ลูกบอลในภาพสีแดงไหม?',
    correctAnswer: 'no',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '🔵',
    visualKey: 'ball-blue',
    explanation: 'ไม่ใช่ ลูกบอลในภาพเป็นสีฟ้า ไม่ใช่สีแดง',
  },
  {
    id: 'pcg-83',
    imageDescription: 'แก้วสีฟ้า',
    prompt: 'แก้วในภาพสีฟ้าไหม?',
    correctAnswer: 'yes',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '🥛',
    visualKey: 'cup-blue',
    explanation: 'ใช่ แก้วใบนี้มีโทนสีฟ้าชัดเจน',
  },
  {
    id: 'pcg-84',
    imageDescription: 'แก้วสีแดง',
    prompt: 'แก้วในภาพสีฟ้าไหม?',
    correctAnswer: 'no',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '🥤',
    visualKey: 'cup-red',
    explanation: 'ไม่ใช่ แก้วใบนี้เป็นสีแดง ไม่ใช่สีฟ้า',
  },
  {
    id: 'pcg-85',
    imageDescription: 'ลูกบอลกลม',
    prompt: 'ลูกบอลมีรูปทรงกลมไหม?',
    correctAnswer: 'yes',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '⚽',
    visualKey: 'ball-round',
    explanation: 'ใช่ ลูกบอลมีรูปทรงกลมสมมาตรทุกด้าน',
  },
  {
    id: 'pcg-86',
    imageDescription: 'กล่องสี่เหลี่ยม',
    prompt: 'กล่องในภาพเป็นวงกลมไหม?',
    correctAnswer: 'no',
    category: 'สี รูปทรง & เวลา',
    iconEmoji: '📦',
    visualKey: 'box-square',
    explanation: 'ไม่ใช่ กล่องมีรูปทรงลูกบาศก์สี่เหลี่ยม มีเหลี่ยมมุม',
  },

  // 87-99: ตำแหน่งและมโนทัศน์เชิงพื้นที่ (Spatial Reasoning & Relationships)
  {
    id: 'pcg-87',
    imageDescription: 'ปลาอยู่ในน้ำ',
    prompt: 'ปลาอยู่ในน้ำไหม?',
    correctAnswer: 'yes',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🐠',
    visualKey: 'fish-in-water',
    explanation: 'ใช่ ปลาแหวกว่ายอยู่ภายในน้ำ',
  },
  {
    id: 'pcg-88',
    imageDescription: 'นกอยู่ในกรง',
    prompt: 'ปลาอยู่ในกรงไหม?',
    correctAnswer: 'no',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🦜',
    visualKey: 'bird-in-cage',
    explanation: 'ไม่ใช่ สิ่งที่อยู่ในกรงคือนก ไม่ใช่ปลา',
  },
  {
    id: 'pcg-89',
    imageDescription: 'ช้อนวางบนโต๊ะ',
    prompt: 'ช้อนอยู่บนโต๊ะไหม?',
    correctAnswer: 'yes',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🥄',
    visualKey: 'spoon-on-table',
    explanation: 'ใช่ ช้อนวางอยู่ด้านบนพื้นผิวโต๊ะ',
  },
  {
    id: 'pcg-90',
    imageDescription: 'ช้อนอยู่ในลิ้นชัก',
    prompt: 'ช้อนอยู่บนโต๊ะไหม?',
    correctAnswer: 'no',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🗄️',
    visualKey: 'spoon-in-drawer',
    explanation: 'ไม่ใช่ ช้อนถูกเก็บอยู่ข้างในลิ้นชัก',
  },
  {
    id: 'pcg-91',
    imageDescription: 'รองเท้าอยู่ข้างเท้า',
    prompt: 'รองเท้าอยู่ใกล้เท้าไหม?',
    correctAnswer: 'yes',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '👟',
    visualKey: 'shoes-near-feet',
    explanation: 'ใช่ รองเท้าวางอยู่ติดข้างเท้าในระยะใกล้',
  },
  {
    id: 'pcg-92',
    imageDescription: 'รองเท้าสองข้าง',
    prompt: 'มีรองเท้าเพียงข้างเดียวไหม?',
    correctAnswer: 'no',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '👟',
    visualKey: 'shoes-pair',
    explanation: 'ไม่ใช่ มีรองเท้า 2 ข้างครบถ้วน',
  },
  {
    id: 'pcg-93',
    imageDescription: 'ช้อนวางข้างชาม',
    prompt: 'มีช้อนอยู่ข้างชามไหม?',
    correctAnswer: 'yes',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🥣',
    visualKey: 'spoon-beside-bowl',
    explanation: 'ใช่ ช้อนวางอยู่ด้านข้างของชามข้าว',
  },
  {
    id: 'pcg-94',
    imageDescription: 'ชามเปล่า',
    prompt: 'ในชามมีข้าวไหม?',
    correctAnswer: 'no',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🥣',
    visualKey: 'empty-bowl',
    explanation: 'ไม่ใช่ ชามใบนี้ว่างเปล่า ไม่มีข้าวบรรจุอยู่',
  },
  {
    id: 'pcg-95',
    imageDescription: 'ขนมปังวางบนจาน',
    prompt: 'มีขนมปังอยู่บนจานไหม?',
    correctAnswer: 'yes',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🍞',
    visualKey: 'bread-on-plate',
    explanation: 'ใช่ ขนมปังวางอยู่ตรงกลางจาน',
  },
  {
    id: 'pcg-96',
    imageDescription: 'จานเปล่า',
    prompt: 'มีขนมปังอยู่บนจานไหม?',
    correctAnswer: 'no',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🍽️',
    visualKey: 'empty-plate',
    explanation: 'ไม่ใช่ จานใบนี้เป็นจานเปล่า ไม่มีอาหารอยู่',
  },
  {
    id: 'pcg-97',
    imageDescription: 'แก้วมีน้ำ',
    prompt: 'ในแก้วมีน้ำไหม?',
    correctAnswer: 'yes',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🥛',
    visualKey: 'glass-with-water',
    explanation: 'ใช่ มีน้ำใสบรรจุอยู่เต็มแก้ว',
  },
  {
    id: 'pcg-98',
    imageDescription: 'แก้วเปล่า',
    prompt: 'ในแก้วมีน้ำไหม?',
    correctAnswer: 'no',
    category: 'ตำแหน่ง & มโนทัศน์',
    iconEmoji: '🥛',
    visualKey: 'empty-water-glass',
    explanation: 'ไม่ใช่ ในแก้วนี้แห้งสนิท ไม่มีน้ำอยู่ข้างใน',
  },
  {
    id: 'pcg-99',
    imageDescription: 'คนปิดสวิตช์ก่อนออกจากห้อง',
    prompt: 'ถ้าไม่มีใครอยู่ ควรปิดไฟไหม?',
    correctAnswer: 'yes',
    category: 'ความปลอดภัย & กิจวัตร',
    iconEmoji: '💡',
    visualKey: 'switch-off-light',
    explanation: 'ใช่ ควรปิดสวิตช์ไฟทุกครั้งเมื่อไม่มีใครอยู่ เพื่อความปลอดภัยและประหยัดพลังงาน',
  },
];

/**
 * Localized translations for physical card minigame illustration descriptions (TH / EN / CN)
 */
export const PHYSICAL_CARD_LOCALIZED_DESCRIPTIONS: Record<string, { en: string; zh: string }> = {
  banana: { en: 'Banana', zh: '香蕉' },
  'banana-2': { en: '2 Bananas', zh: '2根香蕉' },
  'banana-3': { en: '3 Bananas', zh: '3根香蕉' },
  'banana-yellow': { en: 'Yellow Banana', zh: '黄香蕉' },
  orange: { en: 'Orange', zh: '橙子' },
  'orange-2': { en: '2 Oranges', zh: '2个橙子' },
  'orange-4': { en: '4 Oranges', zh: '4个橙子' },
  'rice-plate': { en: 'Plate of Rice', zh: '米饭' },
  spoon: { en: 'Spoon', zh: '勺子' },
  'spoon-2': { en: '2 Spoons', zh: '2把勺子' },
  'spoon-3': { en: '3 Spoons', zh: '3把勺子' },
  'spoon-on-table': { en: 'Spoon on Table', zh: '桌上的勺子' },
  'spoon-in-drawer': { en: 'Spoon in Drawer', zh: '抽屉里的勺子' },
  'spoon-beside-bowl': { en: 'Spoon beside Bowl', zh: '碗旁的勺子' },
  fork: { en: 'Fork', zh: '叉子' },
  'water-glass': { en: 'Glass of Water', zh: '水杯' },
  'empty-glass': { en: 'Empty Glass', zh: '空水杯' },
  'empty-water-glass': { en: 'Empty Glass', zh: '空水杯' },
  'glass-1': { en: '1 Glass', zh: '1个水杯' },
  'glass-2': { en: '2 Glasses', zh: '2个水杯' },
  'glass-with-water': { en: 'Glass with Water', zh: '有水的水杯' },
  pillow: { en: 'Pillow', zh: '枕头' },
  shoes: { en: 'Shoes', zh: '鞋子' },
  'shoes-2': { en: 'Pair of Shoes', zh: '一双鞋' },
  'shoes-near-feet': { en: 'Shoes near Feet', zh: '脚边的鞋子' },
  'shoes-pair': { en: 'Pair of Shoes', zh: '一双鞋' },
  hat: { en: 'Hat', zh: '帽子' },
  'hat-sun': { en: 'Sun Hat', zh: '遮阳帽' },
  toothbrush: { en: 'Toothbrush', zh: '牙刷' },
  comb: { en: 'Comb', zh: '梳子' },
  clock: { en: 'Clock', zh: '时钟' },
  'clock-7': { en: 'Clock at 7', zh: '时钟指着7' },
  'clock-3': { en: 'Clock at 3', zh: '时钟指着3' },
  key: { en: 'Key', zh: '钥匙' },
  umbrella: { en: 'Umbrella', zh: '雨伞' },
  'closed-umbrella-rain': { en: 'Closed Umbrella in Rain', zh: '雨中合着的伞' },
  'sun-umbrella': { en: 'Parasol', zh: '遮阳伞' },
  fan: { en: 'Fan', zh: '风扇' },
  soap: { en: 'Soap', zh: '肥皂' },
  towel: { en: 'Towel', zh: '毛巾' },
  broom: { en: 'Broom', zh: '扫帚' },
  mirror: { en: 'Mirror', zh: '镜子' },
  'milk-box': { en: 'Milk Carton', zh: '牛奶盒' },
  fish: { en: 'Fish', zh: '鱼' },
  'fish-in-water': { en: 'Fish in Water', zh: '水里的鱼' },
  cat: { en: 'Cat', zh: '猫' },
  dog: { en: 'Dog', zh: '狗' },
  elephant: { en: 'Elephant', zh: '大象' },
  'apple-1': { en: '1 Apple', zh: '1个苹果' },
  'apple-2': { en: '2 Apples', zh: '2个苹果' },
  'apple-red': { en: 'Red Apple', zh: '红苹果' },
  'apple-green': { en: 'Green Apple', zh: '青苹果' },
  'clean-apple': { en: 'Washed Apple', zh: '洗净的苹果' },
  'flower-2': { en: '2 Flowers', zh: '2朵花' },
  'flower-3': { en: '3 Flowers', zh: '3朵花' },
  'sock-1': { en: '1 Sock', zh: '1只袜子' },
  'socks-2': { en: 'Pair of Socks', zh: '一双袜子' },
  'egg-2': { en: '2 Eggs', zh: '2个鸡蛋' },
  'egg-3': { en: '3 Eggs', zh: '3个鸡蛋' },
  'chair-1': { en: '1 Chair', zh: '1把椅子' },
  'chair-2': { en: '2 Chairs', zh: '2把椅子' },
  'broken-chair': { en: 'Broken Chair', zh: '折断的椅子' },
  'person-resting': { en: 'Person Resting', zh: '正在休息的人' },
  'ball-1': { en: '1 Ball', zh: '1个球' },
  'ball-3': { en: '3 Balls', zh: '3个球' },
  'ball-blue': { en: 'Blue Ball', zh: '蓝球' },
  'ball-round': { en: 'Round Ball', zh: '圆球' },
  'box-square': { en: 'Square Box', zh: '方形盒子' },
  'candle-cake-1': { en: '1 Cake Candle', zh: '蛋糕上的1根蜡烛' },
  'candle-cake-2': { en: '2 Cake Candles', zh: '蛋糕上的2根蜡烛' },
  'plate-2': { en: '2 Plates', zh: '2个盘子' },
  'plate-3': { en: '3 Plates', zh: '3个盘子' },
  'empty-plate': { en: 'Empty Plate', zh: '空盘子' },
  'bread-on-plate': { en: 'Bread on Plate', zh: '盘子里的面包' },
  'empty-bowl': { en: 'Empty Bowl', zh: '空碗' },
  'wash-hands': { en: 'Washing Hands', zh: '正在洗手' },
  'dirty-hands-snack': { en: 'Dirty Hands & Snack', zh: '脏手与零食' },
  'hot-soup': { en: 'Hot Soup', zh: '热汤' },
  'moldy-food': { en: 'Moldy Food', zh: '发霉食物' },
  handrail: { en: 'Holding Handrail', zh: '握着扶手' },
  'gas-stove-on': { en: 'Gas Stove On', zh: '燃气灶开着' },
  'lamp-dark': { en: 'Lamp in Dark', zh: '暗室里的灯' },
  'obstacle-walkway': { en: 'Obstacle on Walkway', zh: '过道上的障碍物' },
  'red-traffic-light': { en: 'Red Traffic Light', zh: '红灯' },
  'green-crossing-light': { en: 'Green Pedestrian Light', zh: '绿灯' },
  'clothes-rain': { en: 'Clothes in Rain', zh: '雨中晾衣' },
  'clothes-sun': { en: 'Clothes in Sun', zh: '阳光下晾衣' },
  'tree-thunder': { en: 'Tree in Thunderstorm', zh: '雷雨下的大树' },
  'plant-watering-can': { en: 'Potted Plant & Watering Can', zh: '盆栽与洒水壶' },
  'plastic-plant': { en: 'Plastic Plant', zh: '塑料植物' },
  'phone-bank-code': { en: 'Stranger Phone Call', zh: '陌生人来电' },
  peephole: { en: 'Door Peephole', zh: '门上猫眼' },
  'store-pay': { en: 'Paying at Store', zh: '在商店付款' },
  'calendar-1': { en: 'Calendar 1st', zh: '日历1号' },
  'calendar-2': { en: 'Calendar 2nd', zh: '日历2号' },
  'cup-blue': { en: 'Blue Cup', zh: '蓝水杯' },
  'cup-red': { en: 'Red Cup', zh: '红水杯' },
  'bird-in-cage': { en: 'Bird in Cage', zh: '笼中鸟' },
  'switch-off-light': { en: 'Turning off Lights', zh: '关灯' },
};

/**
 * Localized EN / ZH translations for all 99 card prompts and explanations
 */
export const PHYSICAL_CARD_LOCALIZED_QUESTIONS: Record<
  string,
  { prompt: { en: string; zh: string }; explanation: { en: string; zh: string } }
> = {
  'pcg-01': {
    prompt: { en: 'Is a banana a fruit?', zh: '香蕉是水果吗？' },
    explanation: {
      en: 'Yes, bananas are a fruit rich in energy and potassium.',
      zh: '是的，香蕉是富含能量和钾元素的水果。',
    },
  },
  'pcg-02': {
    prompt: { en: 'Is that a banana in the picture?', zh: '图里是香蕉吗？' },
    explanation: {
      en: 'No, the picture shows an orange, not a banana.',
      zh: '不是，图里是橙子，不是香蕉。',
    },
  },
  'pcg-03': {
    prompt: { en: 'Is rice food?', zh: '米饭是食物吗？' },
    explanation: {
      en: 'Yes, rice is a staple food that provides carbohydrates.',
      zh: '是的，米饭是提供碳水化合物的主食。',
    },
  },
  'pcg-04': {
    prompt: { en: 'Is a spoon used to scoop food?', zh: '勺子是用来舀食物的吗？' },
    explanation: {
      en: 'Yes, a spoon is used for scooping food and liquids.',
      zh: '是的，勺子用来舀取食物和汤水。',
    },
  },
  'pcg-05': {
    prompt: { en: 'Is that a spoon in the picture?', zh: '图里是勺子吗？' },
    explanation: {
      en: 'No, the picture shows a fork for picking up food.',
      zh: '不是，图里是用来叉食物的叉子。',
    },
  },
  'pcg-06': {
    prompt: { en: 'Is a glass used to hold water?', zh: '水杯是用来装水的吗？' },
    explanation: {
      en: 'Yes, a water glass is a container for drinks.',
      zh: '是的，水杯是用来盛装饮品的容器。',
    },
  },
  'pcg-07': {
    prompt: { en: 'Is there water in the glass?', zh: '杯子里有水吗？' },
    explanation: {
      en: 'No, this glass is completely empty with no water.',
      zh: '没有，这个杯子是空的，里面没有水。',
    },
  },
  'pcg-08': {
    prompt: { en: 'Is a pillow used to rest your head?', zh: '枕头是用来垫头的吗？' },
    explanation: {
      en: 'Yes, a pillow supports your head and neck while sleeping.',
      zh: '是的，枕头在睡觉时用来支撑头部和颈部。',
    },
  },
  'pcg-09': {
    prompt: { en: 'Do you wear shoes on your feet?', zh: '鞋子是穿在脚上的吗？' },
    explanation: {
      en: 'Yes, shoes are worn on the feet to protect against injury.',
      zh: '是的，鞋子穿在脚上可以保护双脚免受伤害。',
    },
  },
  'pcg-10': {
    prompt: { en: 'Do you wear a hat on your head?', zh: '帽子是戴在头上的吗？' },
    explanation: {
      en: 'Yes, a hat is worn on the head for sun protection or warmth.',
      zh: '是的，帽子戴在头上可以遮阳或保暖。',
    },
  },
  'pcg-11': {
    prompt: { en: 'Do you use a toothbrush to brush teeth?', zh: '用牙刷来刷牙吗？' },
    explanation: {
      en: 'Yes, a toothbrush cleans your teeth and mouth.',
      zh: '是的，牙刷用来清洁牙齿和口腔。',
    },
  },
  'pcg-12': {
    prompt: { en: 'Is that a toothbrush in the picture?', zh: '图里是牙刷吗？' },
    explanation: {
      en: 'No, the picture shows a comb for styling hair.',
      zh: '不是，图里是用来梳头的梳子。',
    },
  },
  'pcg-13': {
    prompt: { en: 'Is a clock used to tell time?', zh: '时钟是用来看时间的吗？' },
    explanation: {
      en: 'Yes, a clock tells the hours and minutes.',
      zh: '是的，时钟用来显示小时和分钟。',
    },
  },
  'pcg-14': {
    prompt: { en: 'Is a key used to open a door?', zh: '钥匙是用来开门的吗？' },
    explanation: {
      en: 'Yes, a key locks and unlocks doors.',
      zh: '是的，钥匙用来锁门和开锁。',
    },
  },
  'pcg-15': {
    prompt: { en: 'Does an umbrella keep off rain?', zh: '雨伞能挡雨吗？' },
    explanation: {
      en: 'Yes, an umbrella protects you from rain and sunlight.',
      zh: '是的，雨伞可以遮挡雨水和阳光。',
    },
  },
  'pcg-16': {
    prompt: { en: 'Does a fan make a breeze?', zh: '风扇能吹出风吗？' },
    explanation: {
      en: 'Yes, spinning fan blades create airflow to cool you down.',
      zh: '是的，风扇叶片转动可以产生风来散热。',
    },
  },
  'pcg-17': {
    prompt: { en: 'Is soap used to wash hands?', zh: '肥皂是用来洗手的吗？' },
    explanation: {
      en: 'Yes, soap washes dirt and germs off your hands.',
      zh: '是的，肥皂可以洗去手上的污垢和细菌。',
    },
  },
  'pcg-18': {
    prompt: { en: 'Can you dry off with this towel?', zh: '可以用这条毛巾擦身体吗？' },
    explanation: {
      en: 'Yes, a towel absorbs water to dry your skin.',
      zh: '是的，毛巾能吸水，可以把身体擦干。',
    },
  },
  'pcg-19': {
    prompt: { en: 'Is a broom used to sweep the floor?', zh: '扫帚是用来扫地的吗？' },
    explanation: {
      en: 'Yes, a broom sweeps dust and debris off the floor.',
      zh: '是的，扫帚用来清扫地面上的灰尘和杂物。',
    },
  },
  'pcg-20': {
    prompt: { en: 'Does a mirror let you see your face?', zh: '镜子能照见自己的脸吗？' },
    explanation: {
      en: 'Yes, the reflective surface of a mirror shows your face.',
      zh: '是的，镜子的反射面可以让你看到自己的脸。',
    },
  },
  'pcg-21': {
    prompt: { en: 'Can you drink milk?', zh: '牛奶可以喝吗？' },
    explanation: {
      en: 'Yes, milk is a nutritious drink rich in calcium and protein.',
      zh: '是的，牛奶是富含钙和蛋白质的饮品。',
    },
  },
  'pcg-22': {
    prompt: { en: 'Does the fish in the picture have wings?', zh: '图里的鱼有翅膀吗？' },
    explanation: {
      en: 'No, ordinary fish have fins and a tail for swimming, not wings.',
      zh: '没有，普通的鱼有鳍和尾巴用来游泳，没有翅膀。',
    },
  },
  'pcg-23': {
    prompt: { en: 'Does a cat have four legs?', zh: '猫有四条腿吗？' },
    explanation: {
      en: 'Yes, a cat is a four-legged animal (2 front, 2 back legs).',
      zh: '是的，猫是四足动物（前腿2条，后腿2条）。',
    },
  },
  'pcg-24': {
    prompt: { en: 'Is that a cat in the picture?', zh: '图里是猫吗？' },
    explanation: {
      en: 'No, the animal in the picture is a dog, not a cat.',
      zh: '不是，图里的动物是狗，不是猫。',
    },
  },
  'pcg-25': {
    prompt: { en: 'Does an elephant have a trunk?', zh: '大象有长鼻子吗？' },
    explanation: {
      en: 'Yes, elephants have a long trunk for smelling, grasping, and spraying water.',
      zh: '是的，大象有长鼻子，用来闻气味、抓取东西和喷水。',
    },
  },
  'pcg-26': {
    prompt: { en: 'Is there 1 apple?', zh: '有1个苹果吗？' },
    explanation: {
      en: 'Yes, there is 1 red apple in the picture.',
      zh: '是的，图里有1个红苹果。',
    },
  },
  'pcg-27': {
    prompt: { en: 'Are there 3 apples?', zh: '有3个苹果吗？' },
    explanation: {
      en: 'No, there are only 2 apples in the picture, not 3.',
      zh: '不是，图里只有2个苹果，不是3个。',
    },
  },
  'pcg-28': {
    prompt: { en: 'Are there 3 bananas?', zh: '有3根香蕉吗？' },
    explanation: {
      en: 'Yes, counting carefully shows all 3 bananas.',
      zh: '是的，数一数一共有3根香蕉。',
    },
  },
  'pcg-29': {
    prompt: { en: 'Are there 3 bananas?', zh: '有3根香蕉吗？' },
    explanation: {
      en: 'No, there are only 2 bananas in the picture.',
      zh: '不是，图里只有2根香蕉。',
    },
  },
  'pcg-30': {
    prompt: { en: 'Are there 2 glasses?', zh: '有2个杯子吗？' },
    explanation: {
      en: 'Yes, there are exactly 2 glasses.',
      zh: '是的，正好放着2个水杯。',
    },
  },
  'pcg-31': {
    prompt: { en: 'Are there 2 glasses?', zh: '有2个杯子吗？' },
    explanation: {
      en: 'No, there is only 1 glass in the picture.',
      zh: '不是，图里只有1个水杯。',
    },
  },
  'pcg-32': {
    prompt: { en: 'Are there 2 flowers?', zh: '有2朵花吗？' },
    explanation: {
      en: 'Yes, there are 2 blooming flowers.',
      zh: '是的，有2朵盛开的花朵。',
    },
  },
  'pcg-33': {
    prompt: { en: 'Are there 2 flowers?', zh: '有2朵花吗？' },
    explanation: {
      en: 'No, there are 3 flowers in the picture, not 2.',
      zh: '不是，图里有3朵花，不是2朵。',
    },
  },
  'pcg-34': {
    prompt: { en: 'Is this a complete pair of socks?', zh: '这是一双完整的袜子吗？' },
    explanation: {
      en: 'Yes, 2 socks together make 1 complete pair.',
      zh: '是的，2只袜子合起来正好是一双。',
    },
  },
  'pcg-35': {
    prompt: { en: 'Is this a complete pair of socks?', zh: '这是一双完整的袜子吗？' },
    explanation: {
      en: 'No, there is only 1 sock; one is missing to make a pair.',
      zh: '不是，这里只有1只袜子，缺了一只不成双。',
    },
  },
  'pcg-36': {
    prompt: { en: 'Are there 3 eggs?', zh: '有3个鸡蛋吗？' },
    explanation: {
      en: 'Yes, there are 3 eggs in the picture.',
      zh: '是的，图里有3个鸡蛋。',
    },
  },
  'pcg-37': {
    prompt: { en: 'Are there 3 eggs?', zh: '有3个鸡蛋吗？' },
    explanation: {
      en: 'No, there are only 2 eggs in the picture.',
      zh: '不是，图里只有2个鸡蛋。',
    },
  },
  'pcg-38': {
    prompt: { en: 'Are there 2 chairs?', zh: '有2把椅子吗？' },
    explanation: {
      en: 'Yes, there are 2 chairs.',
      zh: '是的，画面里有2把椅子。',
    },
  },
  'pcg-39': {
    prompt: { en: 'Are there 2 chairs?', zh: '有2把椅子吗？' },
    explanation: {
      en: 'No, there is only 1 chair in the picture.',
      zh: '不是，图里只有1把椅子。',
    },
  },
  'pcg-40': {
    prompt: { en: 'Are there 3 spoons?', zh: '有3把勺子吗？' },
    explanation: {
      en: 'Yes, there are 3 spoons lined up in the picture.',
      zh: '是的，图里排着3把勺子。',
    },
  },
  'pcg-41': {
    prompt: { en: 'Are there 3 spoons?', zh: '有3把勺子吗？' },
    explanation: {
      en: 'No, there are only 2 spoons in the picture.',
      zh: '不是，图里只有2把勺子。',
    },
  },
  'pcg-42': {
    prompt: { en: 'Are there 2 oranges?', zh: '有2个橙子吗？' },
    explanation: {
      en: 'Yes, there are 2 oranges.',
      zh: '是的，图里有2个橙子。',
    },
  },
  'pcg-43': {
    prompt: { en: 'Are there 2 oranges?', zh: '有2个橙子吗？' },
    explanation: {
      en: 'No, there are 4 oranges in the picture, not 2.',
      zh: '不是，图里有4个橙子，不是2个。',
    },
  },
  'pcg-44': {
    prompt: { en: 'Is there 1 ball?', zh: '有1个球吗？' },
    explanation: {
      en: 'Yes, there is 1 round ball.',
      zh: '是的，图里有1个圆球。',
    },
  },
  'pcg-45': {
    prompt: { en: 'Are there 2 balls?', zh: '有2个球吗？' },
    explanation: {
      en: 'No, there are 3 balls in the picture, not 2.',
      zh: '不是，图里有3个球，不是2个。',
    },
  },
  'pcg-46': {
    prompt: { en: 'Are there 2 candles?', zh: '有2根蜡烛吗？' },
    explanation: {
      en: 'Yes, there are 2 candles on top of the cake.',
      zh: '是的，蛋糕上插着2根蜡烛。',
    },
  },
  'pcg-47': {
    prompt: { en: 'Are there 2 candles?', zh: '有2根蜡烛吗？' },
    explanation: {
      en: 'No, there is only 1 candle on the cake.',
      zh: '不是，蛋糕上只有1根蜡烛。',
    },
  },
  'pcg-48': {
    prompt: { en: 'Are there 3 plates?', zh: '有3个盘子吗？' },
    explanation: {
      en: 'Yes, there are 3 plates.',
      zh: '是的，一共有3个盘子。',
    },
  },
  'pcg-49': {
    prompt: { en: 'Are there 3 plates?', zh: '有3个盘子吗？' },
    explanation: {
      en: 'No, there are only 2 plates in the picture.',
      zh: '不是，图里只有2个盘子。',
    },
  },
  'pcg-50': {
    prompt: { en: 'Is there a complete pair of shoes?', zh: '鞋子是完整的一双吗？' },
    explanation: {
      en: 'Yes, the left and right shoes make 1 complete pair.',
      zh: '是的，左脚和右脚鞋子正好组成一双。',
    },
  },
  'pcg-51': {
    prompt: { en: 'Should you wash hands before eating?', zh: '吃饭前应该洗手吗？' },
    explanation: {
      en: 'Yes, washing hands removes germs before touching food.',
      zh: '是的，洗手可以在接触食物前清除细菌。',
    },
  },
  'pcg-52': {
    prompt: { en: 'Should you eat snacks right away?', zh: '应该马上吃零食吗？' },
    explanation: {
      en: 'No, wash your hands clean before eating snacks to prevent germs.',
      zh: '不应该，吃零食前必须先把手洗干净以防病菌。',
    },
  },
  'pcg-53': {
    prompt: { en: 'Should you wait for hot soup to cool before eating?', zh: '热汤应该晾凉一点再喝吗？' },
    explanation: {
      en: 'Yes, let hot food cool slightly before eating to avoid burning your mouth.',
      zh: '是的，应该等食物稍微放凉再吃以免烫伤口腔。',
    },
  },
  'pcg-54': {
    prompt: { en: 'Should you eat this food?', zh: '这个食物可以吃吗？' },
    explanation: {
      en: 'No, moldy food contains harmful toxins and mold.',
      zh: '不能吃，发霉的食物含有对健康有害的毒素和霉菌。',
    },
  },
  'pcg-55': {
    prompt: { en: 'Is this safe to eat?', zh: '这个能吃吗？' },
    explanation: {
      en: 'Yes, cleanly washed fruit is safe and ready to eat.',
      zh: '是的，洗干净的水果可以安全食用。',
    },
  },
  'pcg-56': {
    prompt: { en: 'Does a closed umbrella block the rain?', zh: '合着的雨伞能挡雨吗？' },
    explanation: {
      en: 'No, a closed umbrella cannot block raindrops; you must open it.',
      zh: '不能，合着的雨伞挡不住雨水，需要打开使用。',
    },
  },
  'pcg-57': {
    prompt: { en: 'Does a hat help shade the sun?', zh: '帽子能帮忙遮阳吗？' },
    explanation: {
      en: 'Yes, a hat brim shades sunlight away from your face and eyes.',
      zh: '是的，帽檐可以遮挡阳光，保护面部和眼睛。',
    },
  },
  'pcg-58': {
    prompt: { en: 'Does the handrail help support you?', zh: '楼梯扶手能帮忙支撑身体吗？' },
    explanation: {
      en: 'Yes, holding the handrail improves balance and prevents falls.',
      zh: '是的，扶着楼梯扶手有助于保持平衡，防止跌倒。',
    },
  },
  'pcg-59': {
    prompt: { en: 'Should you sit on this chair?', zh: '应该坐这把椅子吗？' },
    explanation: {
      en: 'No, a chair with a broken leg may collapse and cause injury.',
      zh: '不应该坐，椅子腿损坏可能会塌陷导致受伤。',
    },
  },
  'pcg-60': {
    prompt: { en: 'Does sitting down help you rest?', zh: '坐下来休息能缓解疲劳吗？' },
    explanation: {
      en: 'Yes, sitting to rest restores energy and lowers your heart rate.',
      zh: '是的，坐下休息可以恢复体力并让心率平稳下来。',
    },
  },
  'pcg-61': {
    prompt: { en: 'Should you leave the stove on?', zh: '可以开着炉灶离开吗？' },
    explanation: {
      en: 'No! Always turn off the gas stove completely before leaving home to prevent fire.',
      zh: '绝对不行！出门前必须彻底关掉燃气灶以防火灾。',
    },
  },
  'pcg-62': {
    prompt: { en: 'Does turning on a light brighten the room?', zh: '开灯后房间会变亮吗？' },
    explanation: {
      en: 'Yes, turning on lights illuminates the room so you can see clearly.',
      zh: '是的，开灯能照亮房间，让你看得更清楚。',
    },
  },
  'pcg-63': {
    prompt: { en: 'Should you rush through this walkway?', zh: '应该快速冲过这条过道吗？' },
    explanation: {
      en: 'No, clear obstacles away or walk carefully around them.',
      zh: '不应该，应先把障碍物移开或小心绕行。',
    },
  },
  'pcg-64': {
    prompt: { en: 'Can you cross the road right now?', zh: '现在可以过马路吗？' },
    explanation: {
      en: 'No, a red light means stop. Wait for the green pedestrian crossing signal.',
      zh: '不行，红灯表示停下，必须等待绿色的行人通行信号。',
    },
  },
  'pcg-65': {
    prompt: { en: 'Should you look for cars before crossing?', zh: '过马路前应该左右看车吗？' },
    explanation: {
      en: 'Yes, even on a green light, look both ways to ensure cars have stopped.',
      zh: '是的，即使是绿灯，也要左右观察确认车辆停稳后再过马路。',
    },
  },
  'pcg-66': {
    prompt: { en: 'Will the laundry dry in the rain?', zh: '在雨里晾衣服会干吗？' },
    explanation: {
      en: 'No, rain makes clothes wetter; bring them indoors under cover.',
      zh: '不会干，下雨会把衣服淋得更湿，应该收到室内。',
    },
  },
  'pcg-67': {
    prompt: { en: 'Will wet laundry dry in the sun?', zh: '湿衣服晒在太阳下会干吗？' },
    explanation: {
      en: 'Yes, heat and sunlight evaporate water so clothes dry thoroughly.',
      zh: '是的，热量和阳光会蒸发水分让衣服干透。',
    },
  },
  'pcg-68': {
    prompt: { en: 'Is this a safe place to shelter from rain?', zh: '在雷雨天躲在大树下安全吗？' },
    explanation: {
      en: 'No, standing under a tall tree during lightning risks being struck.',
      zh: '不安全，打雷闪电时站在大树下有被雷击的危险。',
    },
  },
  'pcg-69': {
    prompt: { en: 'Do plants need water?', zh: '植物需要浇水吗？' },
    explanation: {
      en: 'Yes, living plants need water and sunlight to grow.',
      zh: '是的，植物需要水和阳光才能生长。',
    },
  },
  'pcg-70': {
    prompt: { en: 'Does this plant need watering?', zh: '这盆植物需要浇水吗？' },
    explanation: {
      en: 'No, a plastic plant is decorative and not a living plant.',
      zh: '不需要，塑料植物只是装饰品，不是真植物。',
    },
  },
  'pcg-71': {
    prompt: { en: 'Can an umbrella shade you from the sun?', zh: '伞能帮你遮太阳吗？' },
    explanation: {
      en: 'Yes, umbrella fabric reflects heat and blocks strong sunlight.',
      zh: '是的，伞面可以反射热量并遮挡强烈阳光。',
    },
  },
  'pcg-72': {
    prompt: { en: 'Should you share your bank PIN?', zh: '应该告诉陌生人银行密码吗？' },
    explanation: {
      en: 'Never! Keep passwords and bank PINs secret and never share with strangers.',
      zh: '绝对不要！密码和银行卡PIN码是机密，切勿透露给陌生人。',
    },
  },
  'pcg-73': {
    prompt: { en: 'Should you check who is at the door first?', zh: '开门前应该先确认是谁来了吗？' },
    explanation: {
      en: 'Yes, make sure the visitor is known and safe before opening the door.',
      zh: '是的，开门前应先确认是认识且安全的人。',
    },
  },
  'pcg-74': {
    prompt: { en: 'Do you pay before taking your items?', zh: '拿走商品前需要先付款吗？' },
    explanation: {
      en: 'Yes, purchases must be paid for according to store rules.',
      zh: '是的，购买商品需要按商店规定先付款。',
    },
  },
  'pcg-75': {
    prompt: { en: 'Does the hand point to number 7?', zh: '指针指着数字7吗？' },
    explanation: {
      en: 'Yes, the hour hand points directly at 7.',
      zh: '是的，时针正好指着数字7。',
    },
  },
  'pcg-76': {
    prompt: { en: 'Does the hand point to number 7?', zh: '指针指着数字7吗？' },
    explanation: {
      en: 'No, the hand is pointing to 3, not 7.',
      zh: '不是，指针指着数字3，不是7。',
    },
  },
  'pcg-77': {
    prompt: { en: 'Is today the 1st of the month?', zh: '今天是1号吗？' },
    explanation: {
      en: 'Yes, the calendar clearly shows day 1.',
      zh: '是的，日历上显示的是1号。',
    },
  },
  'pcg-78': {
    prompt: { en: 'Is today the 1st of the month?', zh: '今天是1号吗？' },
    explanation: {
      en: 'No, the calendar page shows day 2.',
      zh: '不是，日历上显示的是2号。',
    },
  },
  'pcg-79': {
    prompt: { en: 'Is the apple in the picture red?', zh: '图里的苹果是红色的吗？' },
    explanation: {
      en: 'Yes, the apple has bright red skin.',
      zh: '是的，这个苹果有鲜红的外皮。',
    },
  },
  'pcg-80': {
    prompt: { en: 'Is the apple in the picture red?', zh: '图里的苹果是红色的吗？' },
    explanation: {
      en: 'No, this apple is green, not red.',
      zh: '不是，这个苹果是青绿色的，不是红色。',
    },
  },
  'pcg-81': {
    prompt: { en: 'Is the banana in the picture yellow?', zh: '图里的香蕉是黄色的吗？' },
    explanation: {
      en: 'Yes, the ripe banana has a golden yellow peel.',
      zh: '是的，成熟的香蕉有着金黄色的外皮。',
    },
  },
  'pcg-82': {
    prompt: { en: 'Is the ball in the picture red?', zh: '图里的球是红色的吗？' },
    explanation: {
      en: 'No, the ball in the picture is blue, not red.',
      zh: '不是，图里的球是蓝色的，不是红色。',
    },
  },
  'pcg-83': {
    prompt: { en: 'Is the cup in the picture blue?', zh: '图里的杯子是蓝色的吗？' },
    explanation: {
      en: 'Yes, this cup is clearly blue.',
      zh: '是的，这个水杯明显是蓝色的。',
    },
  },
  'pcg-84': {
    prompt: { en: 'Is the cup in the picture blue?', zh: '图里的杯子是蓝色的吗？' },
    explanation: {
      en: 'No, this cup is red, not blue.',
      zh: '不是，这个杯子是红色的，不是蓝色。',
    },
  },
  'pcg-85': {
    prompt: { en: 'Is the ball round in shape?', zh: '球是圆形的吗？' },
    explanation: {
      en: 'Yes, a ball is symmetrical and round on all sides.',
      zh: '是的，球体各个方向都是对称圆形的。',
    },
  },
  'pcg-86': {
    prompt: { en: 'Is the box in the picture a circle?', zh: '图里的盒子是圆形吗？' },
    explanation: {
      en: 'No, a box is a square cube with corners and edges.',
      zh: '不是，盒子是带棱角的方形立方体。',
    },
  },
  'pcg-87': {
    prompt: { en: 'Is the fish in the water?', zh: '鱼在水里吗？' },
    explanation: {
      en: 'Yes, the fish is swimming inside the water.',
      zh: '是的，鱼正在水里游动。',
    },
  },
  'pcg-88': {
    prompt: { en: 'Is a fish inside the cage?', zh: '笼子里是鱼吗？' },
    explanation: {
      en: 'No, it is a bird inside the cage, not a fish.',
      zh: '不是，笼子里是一只鸟，不是鱼。',
    },
  },
  'pcg-89': {
    prompt: { en: 'Is the spoon on the table?', zh: '勺子在桌子上吗？' },
    explanation: {
      en: 'Yes, the spoon is resting on top of the table.',
      zh: '是的，勺子放在桌面上。',
    },
  },
  'pcg-90': {
    prompt: { en: 'Is the spoon on the table?', zh: '勺子在桌子上吗？' },
    explanation: {
      en: 'No, the spoon is kept inside the drawer.',
      zh: '不是，勺子收在抽屉里面。',
    },
  },
  'pcg-91': {
    prompt: { en: 'Are the shoes near the feet?', zh: '鞋子在脚旁边吗？' },
    explanation: {
      en: 'Yes, the shoes are placed right next to the feet.',
      zh: '是的，鞋子就放在脚边很近的位置。',
    },
  },
  'pcg-92': {
    prompt: { en: 'Is there only one shoe?', zh: '只有一只鞋吗？' },
    explanation: {
      en: 'No, there is a complete pair of 2 shoes.',
      zh: '不是，有一整双共2只鞋。',
    },
  },
  'pcg-93': {
    prompt: { en: 'Is there a spoon beside the bowl?', zh: '碗旁边有勺子吗？' },
    explanation: {
      en: 'Yes, the spoon is placed next to the bowl.',
      zh: '是的，勺子就放在碗的旁边。',
    },
  },
  'pcg-94': {
    prompt: { en: 'Is there rice in the bowl?', zh: '碗里有米饭吗？' },
    explanation: {
      en: 'No, this bowl is empty with no rice inside.',
      zh: '没有，这个碗是空的，里面没有米饭。',
    },
  },
  'pcg-95': {
    prompt: { en: 'Is there bread on the plate?', zh: '盘子上有面包吗？' },
    explanation: {
      en: 'Yes, bread is placed in the center of the plate.',
      zh: '是的，面包放在盘子中间。',
    },
  },
  'pcg-96': {
    prompt: { en: 'Is there bread on the plate?', zh: '盘子上有面包吗？' },
    explanation: {
      en: 'No, this plate is empty with no food on it.',
      zh: '没有，这个盘子是空的，上面没有食物。',
    },
  },
  'pcg-97': {
    prompt: { en: 'Is there water in the glass?', zh: '杯子里有水吗？' },
    explanation: {
      en: 'Yes, the glass is filled with clear water.',
      zh: '是的，杯子里装满了清水。',
    },
  },
  'pcg-98': {
    prompt: { en: 'Is there water in the glass?', zh: '杯子里有水吗？' },
    explanation: {
      en: 'No, this glass is dry and completely empty.',
      zh: '没有，这个杯子里面是干的，没有水。',
    },
  },
  'pcg-99': {
    prompt: { en: 'Should you turn off the lights when leaving an empty room?', zh: '房间里没人时应该关灯吗？' },
    explanation: {
      en: 'Yes, always switch off lights when leaving an empty room for safety and energy saving.',
      zh: '是的，没人时应随手关灯，既安全又节能。',
    },
  },
};

/**
 * Helper to get localized illustration caption based on active language
 */
export function getLocalizedImageDescription(
  question: PhysicalCardQuestion | null | undefined,
  lang: string = 'th-TH'
): string {
  if (!question) return '';
  if (lang === 'zh-CN') {
    return PHYSICAL_CARD_LOCALIZED_DESCRIPTIONS[question.visualKey]?.zh || question.imageDescription;
  }
  if (lang === 'en-US') {
    return PHYSICAL_CARD_LOCALIZED_DESCRIPTIONS[question.visualKey]?.en || question.imageDescription;
  }
  return question.imageDescription;
}

/**
 * Helper to get localized question prompt based on active language (TH / EN / ZH)
 */
export function getLocalizedPrompt(
  question: PhysicalCardQuestion | null | undefined,
  lang: string = 'th-TH'
): string {
  if (!question) return '';
  if (lang === 'zh-CN') {
    return PHYSICAL_CARD_LOCALIZED_QUESTIONS[question.id]?.prompt.zh || question.prompt;
  }
  if (lang === 'en-US') {
    return PHYSICAL_CARD_LOCALIZED_QUESTIONS[question.id]?.prompt.en || question.prompt;
  }
  return question.prompt;
}

/**
 * Helper to get localized explanation text based on active language (TH / EN / ZH)
 */
export function getLocalizedExplanation(
  question: PhysicalCardQuestion | null | undefined,
  lang: string = 'th-TH'
): string {
  if (!question) return '';
  if (lang === 'zh-CN') {
    return PHYSICAL_CARD_LOCALIZED_QUESTIONS[question.id]?.explanation.zh || question.explanation;
  }
  if (lang === 'en-US') {
    return PHYSICAL_CARD_LOCALIZED_QUESTIONS[question.id]?.explanation.en || question.explanation;
  }
  return question.explanation;
}
