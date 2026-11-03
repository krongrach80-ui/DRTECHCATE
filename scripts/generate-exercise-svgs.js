/**
 * scripts/generate-exercise-svgs.js
 * Generates clinical vector SVG illustrations for all 15 standard exercises.
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

const svgHeader = (titleTh, titleEn) => `
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
    <rect x="-120" y="-14" width="240" height="24" rx="8" fill="#134e4a" stroke="#14b8a6" stroke-width="1" />
    <text x="0" y="3" fill="#5eead4" font-family="system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">
      ${badgeText}
    </text>
  </g>
</svg>
`;

const EXERCISES_SVG_DATA = [
  // 1. Active Shoulder Flexion
  {
    filename: 'active-shoulder-flexion.svg',
    titleTh: '1. ยกแขนไปด้านหน้า (Active Shoulder Flexion)',
    badge: 'เป้าหมาย: ไหล่ 0° → 170° (AAOS)',
    body: `
      <!-- Head & Torso Profile -->
      <circle cx="160" cy="110" r="22" fill="#475569" />
      <path d="M160,135 L160,240 L150,340" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <!-- Resting Arm (faded start position) -->
      <path d="M160,150 L160,250" fill="none" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <!-- Active Flexed Arm (Target position) -->
      <path d="M160,150 L270,100" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Joint highlight -->
      <circle cx="160" cy="150" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <!-- Movement Arc & Arrow -->
      <path d="M185,230 A90,90 0 0,0 260,130" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="250" y="195" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">Flexion ↑</text>
    `,
  },

  // 2. Shoulder Abduction
  {
    filename: 'shoulder-abduction.svg',
    titleTh: '2. ยกแขนไปด้านข้าง (Shoulder Abduction)',
    badge: 'เป้าหมาย: กางไหล่ 0° → 150° (AAOS)',
    body: `
      <!-- Frontal Torso & Head -->
      <circle cx="200" cy="100" r="22" fill="#475569" />
      <path d="M200,125 L200,230 M170,340 L190,230 L210,230 L230,340" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="160" y1="145" x2="240" y2="145" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <!-- Left resting arm -->
      <path d="M160,145 L150,250" fill="none" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <!-- Right resting arm (faded start) -->
      <path d="M240,145 L250,250" fill="none" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <!-- Abducted Arm (Target position) -->
      <path d="M240,145 L340,110" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="240" cy="145" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <!-- Movement Arc & Arrow -->
      <path d="M270,240 A110,110 0 0,0 330,135" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="325" y="190" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">Abduct ↗</text>
    `,
  },

  // 3. Shoulder ER with Band
  {
    filename: 'shoulder-er-band.svg',
    titleTh: '3. หมุนไหล่ออกด้วยยางยืด (Shoulder ER with Band)',
    badge: 'ศอกแนบลำตัว 90° | หมุนออก 45°–75°',
    body: `
      <!-- Frontal Torso & Head -->
      <circle cx="200" cy="95" r="22" fill="#475569" />
      <path d="M200,120 L200,235 M180,340 L195,235 L205,235 L220,340" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <line x1="150" y1="140" x2="250" y2="140" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <!-- Upper arms pinned to sides -->
      <line x1="150" y1="140" x2="150" y2="215" stroke="#64748b" stroke-width="12" stroke-linecap="round" />
      <line x1="250" y1="140" x2="250" y2="215" stroke="#64748b" stroke-width="12" stroke-linecap="round" />
      <!-- Left forearm steady -->
      <line x1="150" y1="215" x2="200" y2="215" stroke="#475569" stroke-width="10" stroke-linecap="round" />
      <!-- Right forearm rotating outward -->
      <line x1="250" y1="215" x2="200" y2="215" stroke="#334155" stroke-width="8" stroke-dasharray="5,4" />
      <line x1="250" y1="215" x2="320" y2="215" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Elastic Band -->
      <path d="M195,215 Q225,218 315,215" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round" />
      <!-- Arrow showing outward rotation -->
      <path d="M245,245 Q285,255 315,230" fill="none" stroke="#14b8a6" stroke-width="3" marker-end="url(#arrowTeal)" />
      <text x="275" y="275" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">Elastic Band ➔</text>
    `,
  },

  // 4. Scapular Retraction
  {
    filename: 'scapular-retraction.svg',
    titleTh: '4. บีบสะบักเข้าหากัน (Scapular Retraction)',
    badge: 'บีบสะบักเข้าหากัน ค้าง 5 วินาที',
    body: `
      <!-- Posterior Torso & Head -->
      <circle cx="200" cy="95" r="22" fill="#475569" />
      <path d="M200,120 L200,260" fill="none" stroke="#334155" stroke-width="6" stroke-dasharray="4,4" />
      <path d="M140,135 Q200,145 260,135 L250,260 L150,260 Z" fill="#1e293b" stroke="#475569" stroke-width="3" />
      <!-- Scapulae plates -->
      <path d="M165,155 L180,165 L175,205 L160,195 Z" fill="#0d9488" stroke="#14b8a6" stroke-width="2" filter="url(#glow)" />
      <path d="M235,155 L220,165 L225,205 L240,195 Z" fill="#0d9488" stroke="#14b8a6" stroke-width="2" filter="url(#glow)" />
      <!-- Inward pinching arrows -->
      <line x1="140" y1="180" x2="175" y2="180" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <line x1="260" y1="180" x2="225" y2="180" stroke="#22d3ee" stroke-width="4" marker-end="url(#arrowCyan)" />
      <text x="200" y="235" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">บีบเข้าหากัน (Pinch)</text>
      <text x="200" y="295" fill="#94a3b8" font-family="system-ui" font-size="11" text-anchor="middle">หลังตรง ไม่อกแอ่น ไม่ยกไหล่</text>
    `,
  },

  // 5. Elbow Flexion and Extension
  {
    filename: 'elbow-flexion-extension.svg',
    titleTh: '5. งอ-เหยียดข้อศอก (Elbow Flexion/Extension)',
    badge: 'มุมข้อศอก: 160° (เหยียด) ↔ 45° (งอ)',
    body: `
      <!-- Side profile -->
      <circle cx="170" cy="100" r="20" fill="#475569" />
      <path d="M170,120 L170,230" fill="none" stroke="#64748b" stroke-width="16" stroke-linecap="round" />
      <!-- Upper arm pinned -->
      <line x1="170" y1="135" x2="170" y2="215" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <!-- Straight arm (start/extension) -->
      <line x1="170" y1="215" x2="170" y2="305" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <!-- Flexed arm (finish) -->
      <line x1="170" y1="215" x2="235" y2="155" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Elbow pivot dot -->
      <circle cx="170" cy="215" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <!-- Flexion arrow -->
      <path d="M190,290 A80,80 0 0,0 235,185" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="235" y="240" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">Flexion ⤹</text>
    `,
  },

  // 6. Seated Knee Extension
  {
    filename: 'seated-knee-extension.svg',
    titleTh: '6. เหยียดเข่านั่งเก้าอี้ (Seated Knee Extension)',
    badge: 'นั่งหลังตรง เหยียดเข่า 90° → 180° ค้าง 2s',
    body: `
      <!-- Chair Frame -->
      <path d="M110,160 L110,270 L195,270 L195,340 M110,270 L110,340" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round" />
      <!-- Seated Silhouette -->
      <circle cx="140" cy="120" r="20" fill="#475569" />
      <path d="M140,140 L140,250 L205,250" fill="none" stroke="#64748b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Knee joint resting (90 deg) -->
      <line x1="205" y1="250" x2="205" y2="330" stroke="#334155" stroke-width="10" stroke-dasharray="6,4" stroke-linecap="round" />
      <!-- Extended Knee (Target 180 deg) -->
      <line x1="205" y1="250" x2="295" y2="250" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="205" cy="250" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <!-- Arc arrow -->
      <path d="M225,320 A70,70 0 0,0 280,265" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="5,3" />
      <text x="260" y="310" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">เตะขึ้น ⤴</text>
    `,
  },

  // 7. Mini Squat
  {
    filename: 'mini-squat.svg',
    titleTh: '7. ย่อเข่าตื้น (Mini Squat 0-60°)',
    badge: 'ย่อเข่า 0°–60° | เข่าไม่เลยปลายเท้า ค้าง 2s',
    body: `
      <!-- Standing silhouette (ghost) -->
      <path d="M150,110 L150,210 L150,280 L150,340" fill="none" stroke="#334155" stroke-width="8" stroke-dasharray="6,4" stroke-linecap="round" />
      <!-- Mini Squatting posture -->
      <circle cx="180" cy="115" r="20" fill="#475569" />
      <!-- Torso slightly inclined forward -->
      <path d="M180,135 L195,225 L160,275 L165,340" fill="none" stroke="url(#accentCyan)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" />
      <circle cx="160" cy="275" r="8" fill="#0d9488" stroke="#22d3ee" stroke-width="2.5" />
      <!-- Knee angle plumb line (Knee doesn't pass toe) -->
      <line x1="160" y1="275" x2="160" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,3" />
      <!-- Depth guide arrows -->
      <path d="M225,180 L225,230" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" />
      <text x="240" y="210" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">ย่อ 0-60° ↓</text>
      <text x="175" y="315" fill="#f59e0b" font-family="system-ui" font-size="10">เข่าไม่เลยปลายเท้า</text>
    `,
  },

  // 8. Sit-to-Stand
  {
    filename: 'sit-to-stand.svg',
    titleTh: '8. ลุกยืนจากเก้าอี้ (Sit-to-Stand)',
    badge: 'ตรวจจับ 2 เงื่อนไข: เข่าเหยียด > 160° & Hip Y ลอยขึ้น',
    body: `
      <!-- Chair -->
      <path d="M90,210 L90,280 L160,280 L160,340 M90,280 L90,340" fill="none" stroke="#334155" stroke-width="7" stroke-linecap="round" />
      <!-- Seated Silhouette (faded) -->
      <circle cx="115" cy="165" r="16" fill="#334155" />
      <path d="M115,185 L120,265 L175,265 L175,340" fill="none" stroke="#334155" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Standing Silhouette (active) -->
      <circle cx="260" cy="95" r="20" fill="#475569" />
      <path d="M260,115 L260,220 L260,340" fill="none" stroke="url(#accentCyan)" stroke-width="14" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="260" cy="220" r="8" fill="#0d9488" stroke="#22d3ee" stroke-width="2.5" />
      <!-- Upward motion arc -->
      <path d="M140,240 Q180,180 230,150" fill="none" stroke="#14b8a6" stroke-width="4" marker-end="url(#arrowTeal)" stroke-dasharray="6,3" />
      <text x="180" y="165" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">ลุกขึ้นยืน ⤤</text>
      <text x="260" y="300" fill="#94a3b8" font-family="system-ui" font-size="10" text-anchor="middle">เข่าเหยียดตรง > 160°</text>
    `,
  },

  // 9. Straight Leg Raise (SLR)
  {
    filename: 'straight-leg-raise.svg',
    titleTh: '9. ยกขาตรง (Straight Leg Raise / SLR)',
    badge: 'มุมกล้องด้านข้าง 45°–90° | เข่าเหยียดตรง > 165°',
    body: `
      <!-- Exercise Mat / Floor -->
      <line x1="40" y1="310" x2="360" y2="310" stroke="#334155" stroke-width="6" stroke-linecap="round" />
      <!-- Supine Patient Torso -->
      <circle cx="85" cy="275" r="18" fill="#475569" />
      <path d="M95,290 L170,290" fill="none" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <!-- Left leg bent (stable) -->
      <path d="M170,290 L205,255 L225,310" fill="none" stroke="#475569" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Right Leg Raising Straight (Target 35-45 deg) -->
      <path d="M170,290 L295,200" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Knee lock dot -->
      <circle cx="232" cy="245" r="7" fill="#0d9488" stroke="#22d3ee" stroke-width="2" />
      <!-- Upward lift arrow -->
      <path d="M290,290 A90,90 0 0,0 300,210" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" stroke-dasharray="4,3" />
      <text x="270" y="180" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">ยก 30°–45° ⤴</text>
      <text x="235" y="270" fill="#f59e0b" font-family="system-ui" font-size="10">ห้ามงอเข่า</text>
    `,
  },

  // 10. Standing Hip Abduction
  {
    filename: 'standing-hip-abduction.svg',
    titleTh: '10. กางขาด้านข้างยืน (Standing Hip Abduction)',
    badge: 'กางขา 15°–40° | ลำตัวตรง (Trunk Tilt ≤ 10°)',
    body: `
      <!-- Vertical plumb line (Anti-Cheat check) -->
      <line x1="200" y1="50" x2="200" y2="350" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,4" />
      <!-- Standing Figure with vertical trunk -->
      <circle cx="200" cy="95" r="20" fill="#475569" />
      <path d="M200,115 L200,225" fill="none" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <!-- Supporting Leg (Straight) -->
      <line x1="195" y1="225" x2="185" y2="340" stroke="#64748b" stroke-width="12" stroke-linecap="round" />
      <!-- Abducting Leg (Target 15-40 deg) -->
      <line x1="205" y1="225" x2="295" y2="310" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <!-- Hip Pivot -->
      <circle cx="205" cy="225" r="8" fill="#0d9488" stroke="#22d3ee" stroke-width="2.5" />
      <!-- Abduction motion arrow -->
      <path d="M225,335 Q265,340 295,315" fill="none" stroke="#14b8a6" stroke-width="3.5" marker-end="url(#arrowTeal)" />
      <text x="290" y="275" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">กางขา ↗</text>
      <text x="135" y="170" fill="#f59e0b" font-family="system-ui" font-size="11" font-weight="bold">ห้ามเอียงตัว!</text>
    `,
  },

  // 11. Calf Raise
  {
    filename: 'calf-raise.svg',
    titleTh: '11. ยกส้นเท้า (Standing Calf / Heel Raise)',
    badge: 'ส้นเท้ายกพ้นพื้น ค้าง 1 วินาที | Multi-frame Filter',
    body: `
      <!-- Floor line -->
      <line x1="60" y1="330" x2="340" y2="330" stroke="#334155" stroke-width="6" stroke-linecap="round" />
      <!-- Lower leg back view -->
      <path d="M150,110 L150,220 L160,305 M250,110 L250,220 L240,305" fill="none" stroke="#64748b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Elevated Heels (Active) -->
      <ellipse cx="160" cy="295" rx="14" ry="10" fill="url(#accentCyan)" filter="url(#glow)" />
      <ellipse cx="240" cy="295" rx="14" ry="10" fill="url(#accentCyan)" filter="url(#glow)" />
      <!-- Ball of feet on floor -->
      <ellipse cx="165" cy="325" rx="12" ry="6" fill="#475569" />
      <ellipse cx="235" cy="325" rx="12" ry="6" fill="#475569" />
      <!-- Lift arrows -->
      <line x1="160" y1="320" x2="160" y2="280" stroke="#14b8a6" stroke-width="4" marker-end="url(#arrowTeal)" />
      <line x1="240" y1="320" x2="240" y2="280" stroke="#14b8a6" stroke-width="4" marker-end="url(#arrowTeal)" />
      <text x="200" y="240" fill="#2dd4bf" font-family="system-ui" font-size="14" font-weight="bold" text-anchor="middle">เขย่งส้นเท้าขึ้น ↑</text>
    `,
  },

  // 12. Single-leg Balance
  {
    filename: 'single-leg-balance.svg',
    titleTh: '12. ยืนขาเดียว (Single-leg Balance)',
    badge: 'ทรงตัวค้าง 15–30 วินาที | สะโพกขนานพื้น ไม่เอียง',
    body: `
      <!-- Pelvic balance level line -->
      <line x1="120" y1="210" x2="280" y2="210" stroke="#14b8a6" stroke-width="2.5" stroke-dasharray="4,4" />
      <!-- Upright figure -->
      <circle cx="200" cy="90" r="20" fill="#475569" />
      <path d="M200,110 L200,210" fill="none" stroke="#64748b" stroke-width="14" stroke-linecap="round" />
      <!-- Stance leg (grounded straight) -->
      <line x1="185" y1="210" x2="185" y2="335" stroke="url(#accentCyan)" stroke-width="14" stroke-linecap="round" filter="url(#glow)" />
      <!-- Lifted leg (knee bent 90 deg in air) -->
      <path d="M215,210 L255,250 L250,300" fill="none" stroke="#64748b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Floor line -->
      <line x1="100" y1="340" x2="300" y2="340" stroke="#334155" stroke-width="6" stroke-linecap="round" />
      <!-- Balance indicator -->
      <circle cx="200" cy="210" r="7" fill="#0d9488" stroke="#22d3ee" stroke-width="2" />
      <text x="200" y="160" fill="#2dd4bf" font-family="system-ui" font-size="13" font-weight="bold" text-anchor="middle">รักษาสมดุล ⚖️</text>
      <text x="200" y="185" fill="#94a3b8" font-family="system-ui" font-size="11" text-anchor="middle">ค้าง 15–30 วินาที</text>
    `,
  },

  // 13. Calf Stretch
  {
    filename: 'calf-stretch.svg',
    titleTh: '13. ยืดน่อง (Standing Calf Stretch)',
    badge: 'ท่ายืนก้าวขา ส้นเท้าหลังติดพื้น ค้าง 20–30s',
    body: `
      <!-- Floor & Wall -->
      <line x1="40" y1="330" x2="360" y2="330" stroke="#334155" stroke-width="6" stroke-linecap="round" />
      <line x1="320" y1="80" x2="320" y2="330" stroke="#334155" stroke-width="8" stroke-linecap="round" />
      <!-- Silhouette leaning toward wall -->
      <circle cx="230" cy="115" r="18" fill="#475569" />
      <!-- Hands on wall -->
      <line x1="230" y1="135" x2="315" y2="150" stroke="#64748b" stroke-width="10" stroke-linecap="round" />
      <!-- Front leg bent -->
      <path d="M230,135 L245,225 L255,275 L260,330" fill="none" stroke="#64748b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Back leg stretched straight (Target) -->
      <path d="M230,225 L140,330" fill="none" stroke="url(#accentCyan)" stroke-width="14" stroke-linecap="round" filter="url(#glow)" />
      <!-- Stretch tension highlight on calf -->
      <ellipse cx="175" cy="285" rx="8" ry="18" fill="#f59e0b" transform="rotate(-40 175 285)" />
      <!-- Heel on floor indicator -->
      <circle cx="140" cy="330" r="6" fill="#14b8a6" />
      <text x="145" y="240" fill="#f59e0b" font-family="system-ui" font-size="12" font-weight="bold">ส้นเท้าหลังติดพื้น</text>
    `,
  },

  // 14. Chin Tuck (Timer Mode)
  {
    filename: 'chin-tuck.svg',
    titleTh: '14. ดึงคางเข้า (Chin Tuck / Cervical Retraction)',
    badge: '⏱️ โหมดจับเวลา: ดึงคางตรงระนาบ ค้าง 5s (10 รอบ)',
    body: `
      <!-- Head Profile Facing Right -->
      <circle cx="190" cy="130" r="35" fill="#475569" />
      <!-- Nose/Chin profile outline -->
      <path d="M220,120 L230,135 L215,145 L225,160 L195,170" fill="none" stroke="#64748b" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Cervical spine & shoulders -->
      <path d="M175,165 Q170,220 160,260 L240,260" fill="none" stroke="#334155" stroke-width="12" stroke-linecap="round" />
      <!-- Horizontal Retraction Arrow (Directly Backward) -->
      <line x1="240" y1="150" x2="185" y2="150" stroke="#22d3ee" stroke-width="5" marker-end="url(#arrowCyan)" filter="url(#glow)" />
      <!-- Retracted target head position (faded ghost) -->
      <circle cx="170" cy="130" r="35" fill="none" stroke="#14b8a6" stroke-width="2" stroke-dasharray="4,4" />
      <text x="210" y="205" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold">ดึงคางเข้าหาคอ ⤆</text>
      <text x="200" y="300" fill="#94a3b8" font-family="system-ui" font-size="11" text-anchor="middle">ไม่ก้มหรือเงยหน้า ตามองตรง</text>
    `,
  },

  // 15. Shoulder Pendulum (Timer Mode)
  {
    filename: 'shoulder-pendulum.svg',
    titleTh: '15. แกว่งแขนผ่อนคลาย (Codman\'s Shoulder Pendulum)',
    badge: '⏱️ โหมดจับเวลา: แกว่งแขนตามแรงโน้มถ่วง 30–60s',
    body: `
      <!-- Table support -->
      <path d="M90,190 L160,190 L160,330" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round" />
      <!-- Supported hand -->
      <circle cx="160" cy="190" r="8" fill="#475569" />
      <!-- Inclined Torso Profile -->
      <circle cx="210" cy="120" r="20" fill="#475569" />
      <path d="M160,190 L210,140 L280,185 L260,330" fill="none" stroke="#64748b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Hanging Affected Arm (Passive under gravity) -->
      <path d="M210,140 L210,250" fill="none" stroke="url(#accentCyan)" stroke-width="12" stroke-linecap="round" filter="url(#glow)" />
      <circle cx="210" cy="140" r="9" fill="#0d9488" stroke="#22d3ee" stroke-width="3" />
      <!-- Circular Pendulum Motion Loop -->
      <ellipse cx="210" cy="275" rx="35" ry="16" fill="none" stroke="#14b8a6" stroke-width="3.5" stroke-dasharray="6,4" />
      <!-- Arrowheads on ellipse -->
      <polygon points="245,275 252,267 252,283" fill="#14b8a6" />
      <polygon points="175,275 168,267 168,283" fill="#14b8a6" />
      <text x="210" y="315" fill="#2dd4bf" font-family="system-ui" font-size="12" font-weight="bold" text-anchor="middle">แกว่งเป็นวงกลมผ่อนคลาย ↻</text>
    `,
  },
];

console.log('Generating 15 clinical vector SVG illustrations...');

EXERCISES_SVG_DATA.forEach((item) => {
  const svgContent = `${svgHeader(item.titleTh, item.filename)}${item.body}${svgFooter(item.badge)}`;
  targetDirs.forEach((dir) => {
    const filePath = path.join(dir, item.filename);
    fs.writeFileSync(filePath, svgContent.trim());
  });
  console.log(`✓ Generated ${item.filename}`);
});

console.log('✓ All 15 clinical vector SVGs generated and synchronized across all portals!');

