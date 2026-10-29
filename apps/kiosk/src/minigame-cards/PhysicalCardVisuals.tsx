/**
 * apps/kiosk/src/minigame-cards/PhysicalCardVisuals.tsx
 * แสดงภาพกราฟิก SVG / Vector สวยงามคมชัด ตรงตามรูปโจทย์ทั้ง 99 ข้อ
 * อิงโทนสีและสไตล์ตามภาพตัวอย่างการ์ดกายภาพ
 */

import React from 'react';

interface PhysicalCardVisualProps {
  visualKey: string;
  imageDescription: string;
  className?: string;
  compact?: boolean;
}

export const PhysicalCardVisual: React.FC<PhysicalCardVisualProps> = React.memo(({
  visualKey,
  imageDescription,
  className = '',
  compact = false,
}) => {
  // Helper to render distinct vector illustrations
  const renderGraphic = () => {
    switch (visualKey) {
      // 1. ผลไม้ & อาหาร
      case 'banana':
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="45" ry="8" fill="#E2E8F0" opacity="0.6" />
            <path
              d="M35 115 C 45 40, 110 30, 128 48 C 115 65, 80 120, 35 115 Z"
              fill="#FACC15"
              stroke="#CA8A04"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M48 108 C 65 55, 105 45, 120 52"
              fill="none"
              stroke="#FDE047"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path d="M128 48 L136 42" stroke="#854D0E" strokeWidth="5" strokeLinecap="round" />
            <circle cx="34" cy="116" r="3.5" fill="#854D0E" />
          </svg>
        );

      case 'banana-2':
        return (
          <svg viewBox="0 0 180 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="90" cy="140" rx="55" ry="8" fill="#E2E8F0" opacity="0.6" />
            {/* Banana 1 */}
            <path
              d="M30 115 C 40 45, 95 35, 115 50 C 100 68, 70 120, 30 115 Z"
              fill="#FACC15"
              stroke="#CA8A04"
              strokeWidth="3.5"
            />
            {/* Banana 2 */}
            <path
              d="M55 125 C 65 55, 120 45, 140 60 C 125 78, 95 130, 55 125 Z"
              fill="#FDE047"
              stroke="#CA8A04"
              strokeWidth="3.5"
            />
          </svg>
        );

      case 'banana-3':
        return (
          <svg viewBox="0 0 180 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="90" cy="142" rx="60" ry="9" fill="#E2E8F0" opacity="0.6" />
            {/* Banana 1 */}
            <path d="M25 110 C 35 45, 85 35, 105 50 C 90 68, 65 115, 25 110 Z" fill="#EAB308" stroke="#A16207" strokeWidth="3" />
            {/* Banana 2 */}
            <path d="M45 120 C 55 55, 105 45, 125 60 C 110 78, 85 125, 45 120 Z" fill="#FACC15" stroke="#CA8A04" strokeWidth="3" />
            {/* Banana 3 */}
            <path d="M65 130 C 75 65, 125 55, 145 70 C 130 88, 105 135, 65 130 Z" fill="#FEF08A" stroke="#CA8A04" strokeWidth="3" />
          </svg>
        );

      case 'banana-yellow':
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="45" ry="8" fill="#E2E8F0" opacity="0.6" />
            <path
              d="M35 115 C 45 40, 110 30, 128 48 C 115 65, 80 120, 35 115 Z"
              fill="#FACC15"
              stroke="#EAB308"
              strokeWidth="4"
            />
            <circle cx="120" cy="50" r="16" fill="#FEF08A" opacity="0.6" />
          </svg>
        );

      case 'orange':
      case 'orange-2':
      case 'orange-4':
        if (visualKey === 'orange-4') {
          return (
            <svg viewBox="0 0 180 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="90" cy="142" rx="65" ry="9" fill="#E2E8F0" opacity="0.6" />
              <circle cx="55" cy="80" r="28" fill="#FB923C" stroke="#C2410C" strokeWidth="3" />
              <circle cx="115" cy="80" r="28" fill="#F97316" stroke="#C2410C" strokeWidth="3" />
              <circle cx="65" cy="115" r="26" fill="#F97316" stroke="#C2410C" strokeWidth="3" />
              <circle cx="125" cy="115" r="26" fill="#FB923C" stroke="#C2410C" strokeWidth="3" />
              <path d="M55 52 Q 60 42, 68 45" stroke="#15803D" strokeWidth="4" fill="none" />
              <path d="M115 52 Q 120 42, 128 45" stroke="#15803D" strokeWidth="4" fill="none" />
            </svg>
          );
        }
        if (visualKey === 'orange-2') {
          return (
            <svg viewBox="0 0 180 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="90" cy="138" rx="55" ry="8" fill="#E2E8F0" opacity="0.6" />
              <circle cx="62" cy="95" r="34" fill="#FB923C" stroke="#C2410C" strokeWidth="3.5" />
              <circle cx="118" cy="95" r="34" fill="#F97316" stroke="#C2410C" strokeWidth="3.5" />
              {/* Leaves */}
              <ellipse cx="62" cy="58" rx="10" ry="5" fill="#22C55E" transform="rotate(-20 62 58)" />
              <ellipse cx="118" cy="58" rx="10" ry="5" fill="#16A34A" transform="rotate(20 118 58)" />
            </svg>
          );
        }
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="138" rx="45" ry="8" fill="#E2E8F0" opacity="0.6" />
            <circle cx="80" cy="88" r="44" fill="#F97316" stroke="#C2410C" strokeWidth="4" />
            <circle cx="68" cy="74" r="34" fill="#FB923C" opacity="0.4" />
            {/* Stem & Leaf */}
            <path d="M80 44 L80 34" stroke="#854D0E" strokeWidth="5" strokeLinecap="round" />
            <path d="M80 38 Q 98 28, 104 36 Q 94 48, 80 40 Z" fill="#22C55E" stroke="#15803D" strokeWidth="2" />
          </svg>
        );

      case 'apple-1':
      case 'apple-red':
      case 'clean-apple':
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="45" ry="8" fill="#E2E8F0" opacity="0.6" />
            <path
              d="M80 50 C 65 30, 32 38, 35 80 C 37 115, 65 132, 80 132 C 95 132, 123 115, 125 80 C 128 38, 95 30, 80 50 Z"
              fill="#EF4444"
              stroke="#B91C1C"
              strokeWidth="4"
            />
            {/* Highlight gloss */}
            <path
              d="M48 65 C 42 75, 42 92, 50 102"
              fill="none"
              stroke="#FCA5A5"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Stem & Leaf */}
            <path d="M80 50 Q 82 25, 92 20" stroke="#78350F" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M86 32 Q 108 24, 112 36 Q 100 48, 86 36 Z" fill="#22C55E" stroke="#15803D" strokeWidth="2" />
          </svg>
        );

      case 'apple-2':
        return (
          <svg viewBox="0 0 180 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="90" cy="140" rx="55" ry="8" fill="#E2E8F0" opacity="0.6" />
            {/* Apple 1 */}
            <g transform="translate(-25, 0) scale(0.9)">
              <path
                d="M80 50 C 65 30, 32 38, 35 80 C 37 115, 65 132, 80 132 C 95 132, 123 115, 125 80 C 128 38, 95 30, 80 50 Z"
                fill="#EF4444"
                stroke="#B91C1C"
                strokeWidth="4"
              />
              <path d="M80 50 Q 82 25, 92 20" stroke="#78350F" strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M86 32 Q 108 24, 112 36 Q 100 48, 86 36 Z" fill="#22C55E" stroke="#15803D" strokeWidth="2" />
            </g>
            {/* Apple 2 */}
            <g transform="translate(35, 10) scale(0.85)">
              <path
                d="M80 50 C 65 30, 32 38, 35 80 C 37 115, 65 132, 80 132 C 95 132, 123 115, 125 80 C 128 38, 95 30, 80 50 Z"
                fill="#DC2626"
                stroke="#991B1B"
                strokeWidth="4"
              />
              <path d="M80 50 Q 82 25, 92 20" stroke="#78350F" strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M86 32 Q 108 24, 112 36 Q 100 48, 86 36 Z" fill="#22C55E" stroke="#15803D" strokeWidth="2" />
            </g>
          </svg>
        );

      case 'apple-green':
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="45" ry="8" fill="#E2E8F0" opacity="0.6" />
            <path
              d="M80 50 C 65 30, 32 38, 35 80 C 37 115, 65 132, 80 132 C 95 132, 123 115, 125 80 C 128 38, 95 30, 80 50 Z"
              fill="#84CC16"
              stroke="#4D7C0F"
              strokeWidth="4"
            />
            <path d="M48 65 C 42 75, 42 92, 50 102" fill="none" stroke="#D9F99D" strokeWidth="5" strokeLinecap="round" />
            <path d="M80 50 Q 82 25, 92 20" stroke="#78350F" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M86 32 Q 108 24, 112 36 Q 100 48, 86 36 Z" fill="#22C55E" stroke="#15803D" strokeWidth="2" />
          </svg>
        );

      case 'rice-plate':
      case 'plate-3':
      case 'plate-2':
      case 'empty-plate':
      case 'bread-on-plate':
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="138" rx="60" ry="10" fill="#E2E8F0" opacity="0.6" />
            <ellipse cx="80" cy="100" rx="65" ry="25" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="4" />
            <ellipse cx="80" cy="98" rx="48" ry="18" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
            {visualKey === 'rice-plate' && (
              <path
                d="M50 95 C 50 70, 110 70, 110 95 Z"
                fill="#F1F5F9"
                stroke="#E2E8F0"
                strokeWidth="2"
              />
            )}
            {visualKey === 'bread-on-plate' && (
              <path
                d="M60 88 C 60 75, 100 75, 100 88 L100 102 L60 102 Z"
                fill="#F59E0B"
                stroke="#B45309"
                strokeWidth="3"
                rx="4"
              />
            )}
          </svg>
        );

      case 'water-glass':
      case 'empty-glass':
      case 'glass-1':
      case 'glass-2':
      case 'cup-blue':
      case 'cup-red':
      case 'glass-with-water':
      case 'empty-water-glass':
        const isRed = visualKey === 'cup-red';
        const isBlue = visualKey === 'cup-blue' || visualKey === 'water-glass' || visualKey === 'glass-with-water';
        const hasWater = visualKey === 'water-glass' || visualKey === 'glass-with-water' || visualKey === 'cup-blue';
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="138" rx="35" ry="8" fill="#E2E8F0" opacity="0.6" />
            {/* Cup Body */}
            <path
              d="M52 45 L58 120 Q 80 128, 102 120 L108 45 Z"
              fill={isRed ? '#FEE2E2' : isBlue ? '#E0F2FE' : '#F8FAFC'}
              stroke={isRed ? '#DC2626' : isBlue ? '#0284C7' : '#94A3B8'}
              strokeWidth="4"
            />
            <ellipse
              cx="80"
              cy="45"
              rx="28"
              ry="8"
              fill={isRed ? '#FECACA' : isBlue ? '#BAE6FD' : '#FFFFFF'}
              stroke={isRed ? '#DC2626' : isBlue ? '#0284C7' : '#94A3B8'}
              strokeWidth="3"
            />
            {hasWater && (
              <path
                d="M55 75 L58 120 Q 80 128, 102 120 L105 75 Q 80 82, 55 75 Z"
                fill="#38BDF8"
                opacity="0.85"
              />
            )}
          </svg>
        );

      case 'spoon':
      case 'fork':
      case 'spoon-2':
      case 'spoon-3':
      case 'spoon-on-table':
      case 'spoon-in-drawer':
      case 'spoon-beside-bowl':
        if (visualKey === 'fork') {
          return (
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="80" cy="140" rx="30" ry="6" fill="#E2E8F0" opacity="0.6" />
              <path d="M78 80 L78 140" stroke="#64748B" strokeWidth="6" strokeLinecap="round" />
              {/* Fork head with 4 tines */}
              <path d="M64 40 L64 70 Q 80 80, 96 70 L96 40" fill="none" stroke="#64748B" strokeWidth="5" strokeLinecap="round" />
              <path d="M74 40 L74 72" stroke="#64748B" strokeWidth="4" />
              <path d="M86 40 L86 72" stroke="#64748B" strokeWidth="4" />
            </svg>
          );
        }
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="30" ry="6" fill="#E2E8F0" opacity="0.6" />
            <path d="M80 75 L80 140" stroke="#64748B" strokeWidth="6" strokeLinecap="round" />
            <ellipse cx="80" cy="48" rx="20" ry="28" fill="#E2E8F0" stroke="#64748B" strokeWidth="5" />
            <ellipse cx="78" cy="45" rx="14" ry="20" fill="#F1F5F9" />
          </svg>
        );

      case 'clock':
      case 'clock-7':
      case 'clock-3':
        const isAt7 = visualKey === 'clock-7';
        const isAt3 = visualKey === 'clock-3';
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="142" rx="40" ry="7" fill="#E2E8F0" opacity="0.6" />
            <circle cx="80" cy="80" r="50" fill="#F8FAFC" stroke="#0F766E" strokeWidth="6" />
            <circle cx="80" cy="80" r="4" fill="#0F766E" />
            {/* Hour marks */}
            <circle cx="80" cy="38" r="2.5" fill="#64748B" />
            <circle cx="122" cy="80" r="2.5" fill="#64748B" />
            <circle cx="80" cy="122" r="2.5" fill="#64748B" />
            <circle cx="38" cy="80" r="2.5" fill="#64748B" />
            {/* Hands */}
            {isAt7 && (
              <>
                <line x1="80" y1="80" x2="80" y2="44" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" />
                <line x1="80" y1="80" x2="60" y2="108" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
              </>
            )}
            {isAt3 && (
              <>
                <line x1="80" y1="80" x2="80" y2="44" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" />
                <line x1="80" y1="80" x2="114" y2="80" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
              </>
            )}
            {!isAt7 && !isAt3 && (
              <>
                <line x1="80" y1="80" x2="80" y2="44" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" />
                <line x1="80" y1="80" x2="108" y2="95" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
              </>
            )}
          </svg>
        );

      case 'shoes':
      case 'shoes-2':
      case 'shoes-near-feet':
      case 'shoes-pair':
      case 'socks-2':
      case 'sock-1':
        if (visualKey === 'sock-1' || visualKey === 'socks-2') {
          return (
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="80" cy="140" rx="45" ry="7" fill="#E2E8F0" opacity="0.6" />
              <path
                d="M60 40 L60 95 Q 60 120, 85 120 L105 120 Q 115 120, 115 110 Q 115 100, 95 100 L85 100 L85 40 Z"
                fill="#38BDF8"
                stroke="#0284C7"
                strokeWidth="4"
                strokeLinejoin="round"
              />
              {visualKey === 'socks-2' && (
                <path
                  d="M75 50 L75 105 Q 75 130, 100 130 L120 130 Q 130 130, 130 120 Q 130 110, 110 110 L100 110 L100 50 Z"
                  fill="#0EA5E9"
                  stroke="#0369A1"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          );
        }
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="138" rx="55" ry="8" fill="#E2E8F0" opacity="0.6" />
            <path
              d="M35 120 Q 55 125, 95 125 Q 135 125, 135 110 Q 135 90, 105 90 L85 80 L65 80 L50 95 L35 105 Z"
              fill="#2563EB"
              stroke="#1D4ED8"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <rect x="32" y="118" width="105" height="10" rx="5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
          </svg>
        );

      case 'cat':
      case 'dog':
      case 'fish':
      case 'elephant':
      case 'fish-in-water':
      case 'bird-in-cage':
        if (visualKey === 'cat') {
          return (
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="80" cy="140" rx="45" ry="7" fill="#E2E8F0" opacity="0.6" />
              <circle cx="80" cy="85" r="38" fill="#FDBA74" stroke="#EA580C" strokeWidth="4" />
              {/* Ears */}
              <polygon points="50,60 40,25 70,48" fill="#FDBA74" stroke="#EA580C" strokeWidth="3" />
              <polygon points="110,60 120,25 90,48" fill="#FDBA74" stroke="#EA580C" strokeWidth="3" />
              {/* Eyes */}
              <ellipse cx="68" cy="80" rx="5" ry="7" fill="#047857" />
              <ellipse cx="92" cy="80" rx="5" ry="7" fill="#047857" />
              {/* Nose & Mouth */}
              <polygon points="76,92 84,92 80,98" fill="#F43F5E" />
              <path d="M74 102 Q 80 106, 86 102" stroke="#475569" strokeWidth="2.5" fill="none" />
              {/* Whiskers */}
              <line x1="55" y1="92" x2="35" y2="90" stroke="#475569" strokeWidth="2" />
              <line x1="55" y1="98" x2="35" y2="102" stroke="#475569" strokeWidth="2" />
              <line x1="105" y1="92" x2="125" y2="90" stroke="#475569" strokeWidth="2" />
              <line x1="105" y1="98" x2="125" y2="102" stroke="#475569" strokeWidth="2" />
            </svg>
          );
        }
        if (visualKey === 'dog') {
          return (
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="80" cy="140" rx="45" ry="7" fill="#E2E8F0" opacity="0.6" />
              <circle cx="80" cy="88" r="38" fill="#D97706" stroke="#92400E" strokeWidth="4" />
              {/* Drooping Ears */}
              <ellipse cx="44" cy="85" rx="12" ry="25" fill="#B45309" transform="rotate(-15 44 85)" />
              <ellipse cx="116" cy="85" rx="12" ry="25" fill="#B45309" transform="rotate(15 116 85)" />
              {/* Eyes */}
              <circle cx="68" cy="80" r="5" fill="#1E293B" />
              <circle cx="92" cy="80" r="5" fill="#1E293B" />
              {/* Big Snout */}
              <ellipse cx="80" cy="100" rx="16" ry="12" fill="#FDE68A" />
              <circle cx="80" cy="95" r="5" fill="#1E293B" />
            </svg>
          );
        }
        if (visualKey === 'elephant') {
          return (
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="80" cy="140" rx="55" ry="8" fill="#E2E8F0" opacity="0.6" />
              <circle cx="80" cy="80" r="38" fill="#94A3B8" stroke="#475569" strokeWidth="4" />
              {/* Big Ears */}
              <ellipse cx="40" cy="78" rx="18" ry="28" fill="#CBD5E1" stroke="#475569" strokeWidth="3" />
              <ellipse cx="120" cy="78" rx="18" ry="28" fill="#CBD5E1" stroke="#475569" strokeWidth="3" />
              {/* Trunk */}
              <path
                d="M75 92 Q 78 135, 95 130 Q 102 125, 88 112"
                fill="none"
                stroke="#64748B"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <circle cx="68" cy="74" r="3.5" fill="#0F172A" />
              <circle cx="92" cy="74" r="3.5" fill="#0F172A" />
            </svg>
          );
        }
        if (visualKey === 'fish' || visualKey === 'fish-in-water') {
          return (
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <ellipse cx="80" cy="140" rx="45" ry="7" fill="#E2E8F0" opacity="0.6" />
              {visualKey === 'fish-in-water' && (
                <rect x="20" y="30" width="120" height="100" rx="16" fill="#E0F2FE" opacity="0.5" stroke="#38BDF8" strokeWidth="2" />
              )}
              {/* Fish body */}
              <path
                d="M40 80 Q 80 45, 115 80 Q 80 115, 40 80 Z"
                fill="#38BDF8"
                stroke="#0284C7"
                strokeWidth="4"
              />
              {/* Tail */}
              <polygon points="112,80 135,62 135,98" fill="#0284C7" />
              <circle cx="58" cy="75" r="4" fill="#0F172A" />
            </svg>
          );
        }
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="40" ry="7" fill="#E2E8F0" opacity="0.6" />
            {/* Cage */}
            <rect x="40" y="30" width="80" height="100" rx="12" fill="none" stroke="#71717A" strokeWidth="4" />
            <line x1="56" y1="30" x2="56" y2="130" stroke="#A1A1AA" strokeWidth="2.5" />
            <line x1="72" y1="30" x2="72" y2="130" stroke="#A1A1AA" strokeWidth="2.5" />
            <line x1="88" y1="30" x2="88" y2="130" stroke="#A1A1AA" strokeWidth="2.5" />
            <line x1="104" y1="30" x2="104" y2="130" stroke="#A1A1AA" strokeWidth="2.5" />
            {/* Bird inside */}
            <circle cx="78" cy="85" r="14" fill="#F59E0B" />
          </svg>
        );

      case 'ball-1':
      case 'ball-3':
      case 'ball-blue':
      case 'ball-round':
        const isBlueBall = visualKey === 'ball-blue';
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="45" ry="8" fill="#E2E8F0" opacity="0.6" />
            <circle cx="80" cy="80" r="44" fill={isBlueBall ? '#38BDF8' : '#F43F5E'} stroke={isBlueBall ? '#0284C7' : '#BE123C'} strokeWidth="4" />
            <circle cx="66" cy="66" r="34" fill="#FFFFFF" opacity="0.25" />
          </svg>
        );

      case 'box-square':
        return (
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
            <ellipse cx="80" cy="140" rx="45" ry="7" fill="#E2E8F0" opacity="0.6" />
            <rect x="45" y="45" width="70" height="70" rx="8" fill="#F59E0B" stroke="#B45309" strokeWidth="4" />
            <line x1="45" y1="80" x2="115" y2="80" stroke="#B45309" strokeWidth="3" />
            <line x1="80" y1="45" x2="80" y2="115" stroke="#B45309" strokeWidth="3" />
          </svg>
        );

      // Default fallback with stylized card illustration
      default:
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
            <div className="w-24 h-24 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-5xl mb-2 shadow-inner">
              {getIconEmoji(visualKey)}
            </div>
          </div>
        );
    }
  };

  if (compact) {
    return (
      <div className={`relative flex items-center justify-center w-full h-full ${className}`}>
        <div className="w-full h-full flex items-center justify-center p-0.5">
          {renderGraphic()}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col items-center justify-center w-full h-full ${className}`}>
      <div className="w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center p-1">
        {renderGraphic()}
      </div>
      <div className="mt-1 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold tracking-wide border border-slate-200">
        ภาพ: {imageDescription}
      </div>
    </div>
  );
});

// Fallback emoji dictionary for items
function getIconEmoji(key: string): string {
  const map: Record<string, string> = {
    hat: '🧢',
    'hat-sun': '🧢',
    pillow: '🛏️',
    toothbrush: '🪥',
    comb: '🪮',
    key: '🔑',
    umbrella: '☂️',
    'closed-umbrella-rain': '☂️',
    'sun-umbrella': '☂️',
    fan: '🪭',
    soap: '🧼',
    towel: '🧖',
    broom: '🧹',
    mirror: '🪞',
    'milk-box': '🥛',
    'flower-2': '🌸',
    'flower-3': '🌺',
    'egg-2': '🥚',
    'egg-3': '🥚',
    'chair-1': '🪑',
    'chair-2': '🪑',
    'broken-chair': '🪑',
    'person-resting': '🪑',
    'candle-cake-1': '🎂',
    'candle-cake-2': '🎂',
    'wash-hands': '🧼',
    'dirty-hands-snack': '🍪',
    'hot-soup': '🍲',
    'moldy-food': '🍞',
    handrail: '🪜',
    'gas-stove-on': '🔥',
    'lamp-dark': '💡',
    'obstacle-walkway': '📦',
    'red-traffic-light': '🛑',
    'green-crossing-light': '🟢',
    'clothes-rain': '🌧️',
    'clothes-sun': '☀️',
    'tree-thunder': '⚡',
    'plant-watering-can': '🪴',
    'plastic-plant': '🎍',
    'phone-bank-code': '📞',
    peephole: '🚪',
    'store-pay': '💵',
    'calendar-1': '📅',
    'calendar-2': '📅',
    'switch-off-light': '💡',
  };
  return map[key] || '💡';
}
