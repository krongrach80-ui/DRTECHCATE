/**
 * scripts/generate-exercise-svgs.js
 * Generates clinical vector SVG illustrations for all standard physical therapy exercises.
 * Supports the 15 Active Canonical Exercises (6 original passing + 9 new seated upper-body exercises)
 * as well as legacy exercises for complete backwards compatibility.
 */

const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.resolve(__dirname, '../public/assets/exercises'),
  path.resolve(__dirname, '../apps/admin/public/assets/exercises'),
  path.resolve(__dirname, '../apps/pt/public/assets/exercises'),
  path.resolve(__dirname, '../apps/kiosk/public/assets/exercises'),
];

targetDirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const svgHeader = (titleTh) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="primaryTeal" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0d9488" />
      <stop offset="100%" stop-color="#14b8a6" />
    </linearGradient>
    <linearGradient id="accentCyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#22d3ee" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <marker id="arrowTeal" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#14b8a6" />
    </marker>
    <marker id="arrowCyan" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#22d3ee" />
    </marker>
  </defs>

  <!-- Background Card -->
  <rect width="400" height="400" rx="32" fill="url(#bgGrad)" stroke="#334155" stroke-width="2" />
  
  <!-- Subtle Clinical Grid -->
  <circle cx="200" cy="200" r="160" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="4,6" />
  <circle cx="200" cy="200" r="100" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="4,6" />
  
  <!-- Title Badge -->
  <rect x="20" y="20" width="360" height="36" rx="10" fill="#0f172a" fill-opacity="0.8" stroke="#1e293b" />
  <text x="200" y="43" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">
    ${titleTh}
  </text>
`;

const svgFooter = (badgeText) => `
  <!-- Bottom Clinical Badge -->
  <g transform="translate(200, 365)">
    <rect x="-135" y="-14" width="270" height="24" rx="8" fill="#134e4a" stroke="#14b8a6" stroke-width="1" />
    <text x="0" y="3" fill="#5eead4" font-family="system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">
      ${badgeText}
    </text>
  </g>
</svg>
`;

const EXERCISES_SVG_DATA = [
  // 1. Active Shoulder Flexion (PASSING)
  {
    filename: 'active-shoulder-flexion.svg',
    titleTh: '1. ยกแขนไปด้านหน้า (Active Shoulder Flexion)',
    badge: 'เป้าหมาย: ไหล่ 0° → 170° (AAOS)',
    body: `
      <circle cx="160" cy="110" r="22" fill="#475569" />
      <path d="M160,135 L160,240 L150,340" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <path d="M160,150 L160,250" fill="none" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <path d="M160,150 L270,100" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="160" cy="150" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <path d="M185,230 A90,90 0 0,0 260,130" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="250" y="195" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">Flexion ↑</text>
    `,
  },

  // 2. Shoulder Abduction (PASSING)
  {
    filename: 'shoulder-abduction.svg',
    titleTh: '2. ยกแขนไปด้านข้าง (Shoulder Abduction)',
    badge: 'เป้าหมาย: กางไหล่ 0° → 150° (AAOS)',
    body: `
      <circle cx="200" cy="100" r="22" fill="#475569" />
      <path d="M200,125 L200,230 M170,340 L190,230 L210,230 L230,340" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="160" y1="145" x2="240" y2="145" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <path d="M160,145 L150,250" fill="none" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <path d="M240,145 L250,250" fill="none" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <path d="M240,145 L340,110" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="240" cy="145" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <path d="M270,240 A110,110 0 0,0 330,135" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="325" y="190" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">Abduct ↗</text>
    `,
  },

  // 3. Shoulder ER with Band (PASSING)
  {
    filename: 'shoulder-er-band.svg',
    titleTh: '3. หมุนไหล่ออกด้วยยางยืด (Shoulder ER with Band)',
    badge: 'ศอกแนบลำตัว 90° | หมุนออก 45°–75°',
    body: `
      <circle cx="200" cy="95" r="22" fill="#475569" />
      <path d="M200,120 L200,235 M180,340 L195,235 L205,235 L220,340" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <line x1="150" y1="140" x2="250" y2="140" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <line x1="150" y1="140" x2="150" y2="215" stroke="#64748b" stroke-width="12" stroke-linecap="round" />
      <line x1="250" y1="140" x2="250" y2="215" stroke="#64748b" stroke-width="12" stroke-linecap="round" />
      <line x1="150" y1="215" x2="200" y2="215" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <line x1="250" y1="215" x2="200" y2="215" stroke="#334155" stroke-width="8" stroke-dasharray="5,4" />
      <line x1="250" y1="215" x2="320" y2="215" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <path d="M195,215 Q225,218 315,215" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round" />
      <path d="M245,245 Q285,255 315,230" fill="none" stroke="#14b8a6" stroke-width="3" marker-end="url(#arrowTeal)" />
      <text x="275" y="275" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">Elastic Band ➔</text>
    `,
  },

  // 4. Scapular Retraction (PASSING)
  {
    filename: 'scapular-retraction.svg',
    titleTh: '4. บีบสะบักเข้าหากัน (Scapular Retraction)',
    badge: 'บีบสะบักเข้าหากัน ค้าง 5 วินาที',
    body: `
      <circle cx="200" cy="95" r="22" fill="#475569" />
      <path d="M200,120 L200,260" fill="none" stroke="#334155" stroke-width="6" stroke-dasharray="4,4" />
      <path d="M140,135 Q200,145 260,135 L250,260 L150,260 Z" fill="#1e293b" stroke="#475569" stroke-width="3" />
      <path d="M165,155 L180,165 L175,205 L160,195 Z" fill="#0d9488" stroke="#14b8a6" stroke-width="2" filter="url(#glow)" />
      <path d="M235,155 L220,165 L225,205 L240,195 Z" fill="#0d9488" stroke="#14b8a6" stroke-width="2" filter="url(#glow)" />
      <line x1="140" y1="180" x2="175" y2="180" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <line x1="260" y1="180" x2="225" y2="180" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <text x="200" y="235" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">บีบเข้าหากัน (Pinch)</text>
      <text x="200" y="295" fill="#94a3b8" font-family="system-ui" font-size="11" text-anchor="middle">หลังตรง ไม่อกแอ่น ไม่ยกไหล่</text>
    `,
  },

  // 5. Elbow Flexion and Extension (PASSING)
  {
    filename: 'elbow-flexion-extension.svg',
    titleTh: '5. งอ-เหยียดข้อศอก (Elbow Flexion/Extension)',
    badge: 'มุมข้อศอก: 160° (เหยียด) ↔ 45° (งอ)',
    body: `
      <circle cx="170" cy="100" r="20" fill="#475569" />
      <path d="M170,120 L170,230" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <line x1="170" y1="135" x2="170" y2="215" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <line x1="170" y1="215" x2="170" y2="305" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <line x1="170" y1="215" x2="235" y2="155" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="170" cy="215" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <path d="M190,290 A80,80 0 0,0 235,185" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="235" y="220" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">งอขึ้น 45°</text>
    `,
  },

  // 14. Chin Tuck (PASSING)
  {
    filename: 'chin-tuck.svg',
    titleTh: '6. เก็บเหนียงเสริมกล้ามเนื้อคอ (Chin Tuck)',
    badge: '⏱️ โหมดจับเวลา: ดึงคางตรงระนาบ ค้าง 5s (10 รอบ)',
    body: `
      <circle cx="190" cy="130" r="35" fill="#475569" />
      <path d="M220,120 L230,135 L215,145 L225,160 L195,170" fill="none" stroke="#64748b" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M175,165 Q170,220 160,260 L240,260" fill="none" stroke="#334155" stroke-width="12" stroke-linecap="round" />
      <line x1="240" y1="150" x2="185" y2="150" stroke="#22d3ee" stroke-width="5" marker-end="url(#arrowCyan)" filter="url(#glow)" />
      <circle cx="170" cy="130" r="35" fill="none" stroke="#14b8a6" stroke-width="2" stroke-dasharray="4,4" />
      <text x="210" y="205" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">ดึงคางเข้าหาคอ ⤆</text>
      <text x="200" y="300" fill="#94a3b8" font-family="system-ui" font-size="11" text-anchor="middle">ไม่ก้มหรือเงยหน้า ตามองตรง</text>
    `,
  },

  // 16. Seated Cervical Rotation (NEW 1)
  {
    filename: 'seated-cervical-rotation.svg',
    titleTh: '7. หันศีรษะซ้าย-ขวา (Seated Cervical Rotation)',
    badge: 'เป้าหมาย: หันศีรษะ 45°–60° (ค้าง 2s)',
    body: `
      <!-- Seated Chair & Posture -->
      <path d="M140,290 L260,290 M150,290 L150,340 M250,290 L250,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="195" width="50" height="95" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Level Shoulders -->
      <line x1="130" y1="195" x2="270" y2="195" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <line x1="130" y1="195" x2="135" y2="280" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <line x1="270" y1="195" x2="265" y2="280" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <!-- Neck -->
      <line x1="200" y1="165" x2="200" y2="195" stroke="#64748b" stroke-width="12" stroke-linecap="round" />
      <!-- Head Front View -->
      <circle cx="200" cy="125" r="28" fill="#475569" />
      <!-- Rotated Head Silhouette Highlight (Ghost target) -->
      <ellipse cx="225" cy="125" rx="26" ry="28" fill="url(#accentCyan)" opacity="0.35" filter="url(#glow)" />
      <!-- Rotation Biomechanical Arcs -->
      <path d="M150,115 Q200,90 250,115" fill="none" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" filter="url(#glow)" />
      <path d="M250,140 Q200,165 150,140" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="4,3" />
      <text x="200" y="75" fill="#5eead4" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">หมุนหันซ้าย-ขวา ↺ ↻</text>
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">ไหล่สองข้างอยู่กับที่ ไม่เอียงตัว</text>
    `,
  },

  // 17. Cervical Side Bend (NEW 2)
  {
    filename: 'cervical-side-bend.svg',
    titleTh: '8. เอียงศีรษะเข้าหาไหล่ (Cervical Side Bend)',
    badge: 'เป้าหมาย: เอียงศีรษะ 20°–35° (ค้าง 2s)',
    body: `
      <!-- Seated Chair & Posture -->
      <path d="M140,290 L260,290 M150,290 L150,340 M250,290 L250,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="195" width="50" height="95" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Level Shoulders (Unmoving anchor) -->
      <line x1="130" y1="195" x2="270" y2="195" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <line x1="130" y1="195" x2="135" y2="280" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <line x1="270" y1="195" x2="265" y2="280" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <!-- Ghost Original Vertical Head -->
      <circle cx="200" cy="120" r="26" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="4,4" />
      <line x1="200" y1="120" x2="200" y2="195" stroke="#334155" stroke-width="2" stroke-dasharray="4,4" />
      <!-- Tilted Head & Neck (Target position) -->
      <path d="M200,195 Q215,160 235,135" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" />
      <circle cx="235" cy="135" r="26" fill="url(#accentCyan)" filter="url(#glow)" />
      <!-- Side Bend Arc Arrow -->
      <path d="M190,95 A55,55 0 0,1 255,105" fill="none" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <text x="270" y="95" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">เอียง 25° ↷</text>
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">ผ่อนคลายไหล่ ไม่ยักไหล่ขึ้นรับ</text>
    `,
  },

  // 18. Shoulder Shrug (NEW 3)
  {
    filename: 'shoulder-shrug.svg',
    titleTh: '9. ยักไหล่ขึ้น-ลง (Shoulder Shrug)',
    badge: 'เป้าหมาย: ยกไหล่ขึ้นตรงๆ ค้าง 2s (10-12 ครั้ง)',
    body: `
      <!-- Seated Upright Torso -->
      <path d="M140,290 L260,290 M150,290 L150,340 M250,290 L250,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="190" width="50" height="100" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Head Still & Centered -->
      <circle cx="200" cy="110" r="26" fill="#475569" />
      <!-- Faded baseline shoulder position -->
      <line x1="130" y1="195" x2="270" y2="195" stroke="#334155" stroke-width="12" stroke-dasharray="6,4" stroke-linecap="round" />
      <!-- Elevated Target Shoulders (Shrugged) -->
      <line x1="135" y1="165" x2="265" y2="165" stroke="url(#accentCyan)" stroke-width="14" stroke-linecap="round" filter="url(#glow)" />
      <line x1="135" y1="165" x2="140" y2="270" stroke="#64748b" stroke-width="10" stroke-linecap="round" />
      <line x1="265" y1="165" x2="260" y2="270" stroke="#64748b" stroke-width="10" stroke-linecap="round" />
      <!-- Vertical Elevation Arrows -->
      <line x1="120" y1="205" x2="120" y2="155" stroke="#22d3ee" stroke-width="4.5" marker-end="url(#arrowCyan)" />
      <line x1="280" y1="205" x2="280" y2="155" stroke="#22d3ee" stroke-width="4.5" marker-end="url(#arrowCyan)" />
      <text x="200" y="240" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">ยักไหล่ขึ้นตรงๆ ⬆</text>
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">ไม่อกแอ่น ไม่ยื่นคอไปข้างหน้า</text>
    `,
  },

  // 19. Upper Trapezius Stretch (NEW 4 - Timer Mode)
  {
    filename: 'upper-trapezius-stretch.svg',
    titleTh: '10. ยืดกล้ามเนื้อบ่า (Upper Trapezius Stretch)',
    badge: '⏱️ โหมดจับเวลา: ค้างท่า 20–30 วินาที/ข้าง',
    body: `
      <!-- Chair base -->
      <path d="M130,290 L270,290 M140,290 L140,340 M260,290 L260,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="195" width="50" height="95" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Left arm gripping chair edge to depress scapula -->
      <line x1="150" y1="195" x2="140" y2="295" stroke="#64748b" stroke-width="10" stroke-linecap="round" />
      <circle cx="140" cy="295" r="7" fill="#f59e0b" />
      <text x="95" y="270" fill="#f59e0b" font-family="system-ui" font-size="9" font-weight="bold">จับขอบเก้าอี้</text>
      <!-- Head Tilted Right with Stretch Band -->
      <circle cx="230" cy="140" r="26" fill="url(#accentCyan)" filter="url(#glow)" />
      <!-- Right hand gently over head -->
      <path d="M250,195 Q275,150 240,115" fill="none" stroke="#14b8a6" stroke-width="8" stroke-linecap="round" />
      <!-- Muscle stretch tension indicator on Left Upper Trap -->
      <path d="M165,190 Q185,160 215,150" fill="none" stroke="#f59e0b" stroke-width="4" stroke-dasharray="4,2" />
      <text x="145" y="155" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">ตึงสบายที่บ่า ⚡</text>
      <!-- Hold Duration Badge -->
      <g transform="translate(200, 75)">
        <rect x="-65" y="-14" width="130" height="24" rx="8" fill="#0f766e" stroke="#2dd4bf" stroke-width="1.5" />
        <text x="0" y="3" fill="#ffffff" font-family="system-ui" font-size="11" font-weight="bold" text-anchor="middle">⏱️ ค้าง 20–30s</text>
      </g>
    `,
  },

  // 20. Seated Trunk Rotation (NEW 5)
  {
    filename: 'seated-trunk-rotation.svg',
    titleTh: '11. หมุนลำตัวท่านั่งกอดอก (Seated Trunk Rotation)',
    badge: 'เป้าหมาย: หมุนลำตัว 20°–35° (ค้าง 2s)',
    body: `
      <!-- Seated Chair & Planted Hips -->
      <path d="M130,290 L270,290 M140,290 L140,340 M260,290 L260,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="200" width="50" height="90" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Planted Hip Anchors -->
      <circle cx="165" cy="285" r="8" fill="#14b8a6" />
      <circle cx="235" cy="285" r="8" fill="#14b8a6" />
      <!-- Head Facing slightly with trunk -->
      <circle cx="205" cy="110" r="24" fill="#475569" />
      <!-- Rotated Shoulder Line -->
      <line x1="145" y1="185" x2="265" y2="165" stroke="url(#accentCyan)" stroke-width="14" stroke-linecap="round" filter="url(#glow)" />
      <!-- Crossed Arms (กอดอก) -->
      <path d="M150,185 Q205,215 255,170" fill="none" stroke="#2dd4bf" stroke-width="11" stroke-linecap="round" />
      <path d="M260,170 Q205,215 155,190" fill="none" stroke="#14b8a6" stroke-width="9" stroke-linecap="round" />
      <!-- Curved Rotation Arrows -->
      <path d="M135,160 Q200,135 270,145" fill="none" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <text x="200" y="250" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">หมุนลำตัวกอดอก ↺ ↻</text>
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">สะโพกแนบเบาะ ไม่เอนหลัง</text>
    `,
  },

  // 21. Seated Side Bend (NEW 6)
  {
    filename: 'seated-side-bend.svg',
    titleTh: '12. เอียงลำตัวด้านข้างท่านั่ง (Seated Side Bend)',
    badge: 'เป้าหมาย: เอียงลำตัว 15°–25° (ค้าง 2s)',
    body: `
      <!-- Seated Chair & Planted Hips -->
      <path d="M130,290 L270,290 M140,290 L140,340 M260,290 L260,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <!-- Planted Hip Anchors (No lifting) -->
      <circle cx="165" cy="285" r="8" fill="#14b8a6" />
      <circle cx="235" cy="285" r="8" fill="#14b8a6" />
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">ก้นสองข้างแนบเบาะ ไม่ลอย</text>
      <!-- Curved Spine / Torso leaning to the right -->
      <path d="M200,285 Q215,225 240,175" fill="none" stroke="url(#accentCyan)" stroke-width="16" stroke-linecap="round" filter="url(#glow)" />
      <!-- Head tilted with trunk -->
      <circle cx="255" cy="125" r="24" fill="#475569" />
      <!-- Right arm sliding down chair leg -->
      <line x1="250" y1="180" x2="270" y2="280" stroke="#2dd4bf" stroke-width="10" stroke-linecap="round" />
      <line x1="285" y1="210" x2="285" y2="270" stroke="#22d3ee" stroke-width="3.5" marker-end="url(#arrowCyan)" />
      <!-- Left side stretch tension -->
      <path d="M185,275 Q195,220 220,180" fill="none" stroke="#f59e0b" stroke-width="3.5" stroke-dasharray="4,2" />
      <text x="145" y="215" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">ยืดสีข้าง ⚡</text>
      <text x="200" y="80" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">เอียงข้าง 15°–25° ↷</text>
    `,
  },

  // 22. Cross-Body Shoulder Stretch (NEW 7 - Timer Mode)
  {
    filename: 'cross-body-shoulder-stretch.svg',
    titleTh: '13. ยืดไหล่ข้ามลำตัว (Cross-Body Stretch)',
    badge: '⏱️ โหมดจับเวลา: ค้างท่า 20–30 วินาที/ข้าง',
    body: `
      <!-- Seated Chair & Posture -->
      <path d="M130,290 L270,290 M140,290 L140,340 M260,290 L260,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="190" width="50" height="100" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Head Front View -->
      <circle cx="200" cy="110" r="25" fill="#475569" />
      <!-- Level Shoulders -->
      <line x1="140" y1="185" x2="260" y2="185" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <!-- Left Arm stretching across chest (Target) -->
      <path d="M145,185 L260,185" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Right Arm hooking and pulling elbow toward body -->
      <path d="M255,240 L220,185 L220,150" fill="none" stroke="#14b8a6" stroke-width="10" stroke-linecap="round" />
      <circle cx="220" cy="185" r="8" fill="#0d9488" stroke="#22d3ee" stroke-width="2" />
      <!-- Pull direction arrow -->
      <line x1="250" y1="165" x2="195" y2="165" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <!-- Posterior shoulder stretch tension highlight -->
      <circle cx="145" cy="185" r="10" fill="#f59e0b" opacity="0.8" />
      <text x="100" y="160" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">ยืดไหล่หลัง ⚡</text>
      <!-- Timer Duration Badge -->
      <g transform="translate(200, 70)">
        <rect x="-65" y="-14" width="130" height="24" rx="8" fill="#0f766e" stroke="#2dd4bf" stroke-width="1.5" />
        <text x="0" y="3" fill="#ffffff" font-family="system-ui" font-size="11" font-weight="bold" text-anchor="middle">⏱️ ค้าง 20–30s</text>
      </g>
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">หน้าตรง ไม่หมุนตัวตามแขน</text>
    `,
  },

  // 23. Seated Horizontal Abduction (NEW 8)
  {
    filename: 'seated-horizontal-abduction.svg',
    titleTh: '14. กางแขนระดับอก (Seated Horizontal Abduction)',
    badge: 'เป้าหมาย: กางแขนระนาบไหล่ 70°–90° (ค้าง 2s)',
    body: `
      <!-- Seated Chair & Posture -->
      <path d="M130,290 L270,290 M140,290 L140,340 M260,290 L260,340" stroke="#334155" stroke-width="5" stroke-linecap="round" />
      <rect x="175" y="195" width="50" height="95" rx="10" fill="#1e293b" stroke="#475569" stroke-width="8" />
      <!-- Head Front View -->
      <circle cx="200" cy="115" r="24" fill="#475569" />
      <!-- Faded starting arms in front of chest -->
      <line x1="160" y1="185" x2="190" y2="185" stroke="#334155" stroke-width="10" stroke-dasharray="5,4" stroke-linecap="round" />
      <line x1="240" y1="185" x2="210" y2="185" stroke="#334155" stroke-width="10" stroke-dasharray="5,4" stroke-linecap="round" />
      <!-- Fully Opened Arms to Both Sides (Target) -->
      <line x1="160" y1="185" x2="80" y2="185" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <line x1="240" y1="185" x2="320" y2="185" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="160" cy="185" r="8" fill="#0d9488" stroke="#22d3ee" stroke-width="2" />
      <circle cx="240" cy="185" r="8" fill="#0d9488" stroke="#22d3ee" stroke-width="2" />
      <!-- Horizontal Outward Arrows -->
      <line x1="160" y1="155" x2="95" y2="155" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <line x1="240" y1="155" x2="305" y2="155" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <text x="200" y="240" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">กางออกระดับอก ⟵ ⟶</text>
      <text x="200" y="325" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">บีบสะบักเข้าหากัน ไม่อกแอ่น</text>
    `,
  },

  // 24. Wrist Flexion/Extension (NEW 9 - Timer Mode)
  {
    filename: 'wrist-flexion-extension.svg',
    titleTh: '15. งอ-เหยียดข้อมือ (Wrist Flexion/Extension)',
    badge: '⏱️ โหมดจับเวลา: ข้อมือบนที่พักแขน (10-12 ครั้ง)',
    body: `
      <!-- Table / Armrest support -->
      <rect x="50" y="235" width="230" height="20" rx="4" fill="#334155" stroke="#475569" stroke-width="2" />
      <line x1="120" y1="255" x2="120" y2="340" stroke="#334155" stroke-width="8" stroke-linecap="round" />
      <text x="140" y="280" fill="#94a3b8" font-family="system-ui" font-size="10">ที่พักแขน / โต๊ะ</text>
      <!-- Forearm firmly supported on table -->
      <rect x="70" y="210" width="180" height="25" rx="10" fill="#475569" />
      <!-- Wrist joint pivot point overhanging edge -->
      <circle cx="250" cy="222" r="10" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <!-- Extended Wrist Position (Upward flexion/extension) -->
      <line x1="250" y1="222" x2="330" y2="155" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Flexed Wrist Position (Downward faded ghost) -->
      <line x1="250" y1="222" x2="310" y2="285" stroke="#334155" stroke-width="10" stroke-dasharray="5,4" stroke-linecap="round" />
      <!-- Up & Down Motion Arcs -->
      <path d="M305,270 A70,70 0 0,0 325,175" fill="none" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <path d="M315,185 A70,70 0 0,1 295,260" fill="none" stroke="#14b8a6" stroke-width="3" marker-end="url(#arrowTeal)" stroke-dasharray="4,3" />
      <text x="315" y="135" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">กระดกขึ้น ⬈</text>
      <text x="315" y="315" fill="#94a3b8" font-family="system-ui" font-size="11">งอลง ⬊</text>
      <text x="160" y="195" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">แขนแนบติดที่พักตลอดเวลา</text>
    `,
  },

  // Legacy Exercises (Maintained for Backwards Compatibility)
  {
    filename: 'seated-knee-extension.svg',
    titleTh: 'เตะเหยียดเข่าท่านั่ง (Seated Knee Extension)',
    badge: 'มุมเข่า: 90° → 180° (ค้าง 2s)',
    body: `<circle cx="160" cy="110" r="22" fill="#475569" /><path d="M160,135 L160,250 L260,250" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'mini-squat.svg',
    titleTh: 'ย่อเข่ามินิสควอท (Mini Squat 0–60°)',
    badge: 'ย่อเข่า 0° → 60° (AAOS)',
    body: `<circle cx="180" cy="100" r="22" fill="#475569" /><path d="M180,125 L170,220 L210,260 L200,340" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'sit-to-stand.svg',
    titleTh: 'ลุกขึ้นยืนจากเก้าอี้ (Sit-to-Stand)',
    badge: 'ลุกยืนเต็มตัว (เข่า > 165°)',
    body: `<circle cx="190" cy="90" r="22" fill="#475569" /><path d="M190,115 L190,220 L190,340" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'straight-leg-raise.svg',
    titleTh: 'ยกขาตรง (Straight Leg Raise - SLR)',
    badge: 'ยกขาตรง 30°–45°',
    body: `<circle cx="120" cy="260" r="20" fill="#475569" /><path d="M120,270 L210,270 L300,210" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'standing-hip-abduction.svg',
    titleTh: 'กางสะโพกท่ายืน (Standing Hip Abduction)',
    badge: 'กางขา 25°–45° ลำตัวตรง',
    body: `<circle cx="200" cy="90" r="20" fill="#475569" /><path d="M200,110 L200,220 M180,330 L195,220 L270,300" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'calf-raise.svg',
    titleTh: 'เขย่งปลายเท้า (Standing Calf Raise)',
    badge: 'ยกส้นเท้าขึ้นเต็มที่ ค้าง 2 วินาที',
    body: `<circle cx="200" cy="90" r="20" fill="#475569" /><path d="M200,110 L200,220 L200,320" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'single-leg-balance.svg',
    titleTh: 'ยืนทรงตัวขาเดียว (Single-Leg Stance Balance)',
    badge: 'ยืนทรงตัวขาเดียว ค้าง 15–30 วินาที',
    body: `<circle cx="200" cy="90" r="20" fill="#475569" /><path d="M200,110 L200,220 L200,330 M200,220 L240,260 L240,300" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
  {
    filename: 'calf-stretch.svg',
    titleTh: 'ยืดน่อง (Standing Calf Stretch)',
    badge: 'ท่ายืนก้าวขา ส้นเท้าหลังติดพื้น ค้าง 20–30s',
    body: `<circle cx="230" cy="115" r="18" fill="#475569" /><path d="M230,135 L245,225 L255,275 L260,330 M230,225 L140,330" stroke="#64748b" stroke-width="12" fill="none" />`,
  },
  {
    filename: 'shoulder-pendulum.svg',
    titleTh: 'แกว่งแขนผ่อนคลาย (Codman\'s Shoulder Pendulum)',
    badge: '⏱️ โหมดจับเวลา: แกว่งแขนตามแรงโน้มถ่วง 30–60s',
    body: `<circle cx="210" cy="120" r="20" fill="#475569" /><path d="M160,190 L210,140 L280,185 L260,330 M210,140 L210,250" stroke="#64748b" stroke-width="14" fill="none" />`,
  },
];

console.log('Generating clinical vector SVG illustrations...');

EXERCISES_SVG_DATA.forEach((item) => {
  const svgContent = `${svgHeader(item.titleTh)}${item.body}${svgFooter(item.badge)}`;
  targetDirs.forEach((dir) => {
    const filePath = path.join(dir, item.filename);
    fs.writeFileSync(filePath, svgContent.trim());
  });
  console.log(`✓ Generated ${item.filename}`);
});

console.log('✓ All clinical vector SVGs generated and synchronized across all portals!');
