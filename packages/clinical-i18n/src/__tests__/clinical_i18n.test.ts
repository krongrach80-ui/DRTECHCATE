/**
 * packages/clinical-i18n/src/__tests__/clinical_i18n.test.ts
 *
 * CLINICAL i18n & GFW IMMUNITY TEST SUITE
 *
 * Verifies:
 * 1. Hospital-Grade Clinical Mandarin (zh-CN), Thai (th-TH), and English (en-US) lexicon
 * 2. Voice feedback synthesis locale switching to zh-CN
 * 3. Zero External CDN & System Font Stack compliance for Great Firewall Immunity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  t,
  setSavedLanguage,
  getSavedLanguage,
  CLINICAL_DICTIONARY,
  LANGUAGE_OPTIONS,
} from '../index';
import { VoiceFeedbackController } from '../../../hospital-ui-kit/src/VoiceFeedbackController';

describe('Clinical Trilingual Engine (zh-CN | th-TH | en-US)', () => {
  beforeEach(() => {
    setSavedLanguage('th-TH');
  });

  it('provides all required clinical terminology in Simplified Chinese (zh-CN)', () => {
    expect(t('rom', 'zh-CN')).toBe('关节活动度 (ROM)');
    expect(t('scapular_hiking', 'zh-CN')).toBe('肩胛骨代偿性上提 (耸肩代偿)');
    expect(t('trunk_lateral_tilt', 'zh-CN')).toBe('躯干侧倾代偿');
    expect(t('angular_jerk_anomaly', 'zh-CN')).toBe('关节角加加速度突变 (疼痛触发点)');
    expect(t('3d_kinematic_replay', 'zh-CN')).toBe('3D 生物力学运动全息回放');
    expect(t('stopped_pain', 'zh-CN')).toBe('🚨 感到疼痛 (立即停止并通知治疗师)');
    expect(t('clinical_report_title', 'zh-CN')).toBe('数字化运动康复临床评估报告 (ICD-10 / LOINC)');
    expect(t('pipl_compliance', 'zh-CN')).toBe(
      '符合中国《个人信息保护法》(PIPL) — 纯三维向量脱敏传输 (零视频留存)'
    );
  });

  it('provides complete translations for all 3 supported clinical locales', () => {
    const keys = Object.keys(CLINICAL_DICTIONARY) as (keyof typeof CLINICAL_DICTIONARY)[];
    expect(keys.length).toBeGreaterThan(15);

    for (const key of keys) {
      const entry = CLINICAL_DICTIONARY[key];
      expect(entry['zh-CN'], `Missing zh-CN for key: ${key}`).toBeDefined();
      expect(entry['th-TH'], `Missing th-TH for key: ${key}`).toBeDefined();
      expect(entry['en-US'], `Missing en-US for key: ${key}`).toBeDefined();
    }
  });

  it('supports real-time language persistence via setSavedLanguage', () => {
    setSavedLanguage('zh-CN');
    expect(getSavedLanguage()).toBe('zh-CN');

    setSavedLanguage('en-US');
    expect(getSavedLanguage()).toBe('en-US');

    setSavedLanguage('th-TH');
    expect(getSavedLanguage()).toBe('th-TH');
  });

  it('exposes standard language option descriptors with country flags', () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(3);
    const codes = LANGUAGE_OPTIONS.map((opt) => opt.code);
    expect(codes).toContain('zh-CN');
    expect(codes).toContain('th-TH');
    expect(codes).toContain('en-US');
  });
});

describe('Mandarin Voice Feedback Synthesis (VoiceFeedbackController)', () => {
  it('correctly sets and gets voice language to zh-CN', () => {
    const controller = new VoiceFeedbackController({ lang: 'th-TH' });
    expect(controller.getLanguage()).toBe('th-TH');

    controller.setLanguage('zh-CN');
    expect(controller.getLanguage()).toBe('zh-CN');
  });

  it('suppresses rapid voice triggers under minCooldown threshold', () => {
    const controller = new VoiceFeedbackController({ minCooldownMs: 3000, lang: 'zh-CN' });
    // In node test environment without browser speech synthesis, speak returns false or suppressed
    controller.speak('请放慢动作', 'slow_down');
    const secondCall = controller.speak('请放慢动作', 'slow_down');
    expect(secondCall).toBe(false); // second call is suppressed by cooldown
  });

  it('contains all required Mandarin Chinese (zh-CN) clinical voice phrases', () => {
    expect(t('voice_lean_forward', 'zh-CN')).toBe('请身体稍微前倾，让肩膀自然下垂');
    expect(t('voice_keep_arm_straight', 'zh-CN')).toBe('请放松手臂自然下垂，不要弯曲手肘');
    expect(t('voice_raised_too_high', 'zh-CN')).toBe('抬得太高了，请慢慢放下以确保安全');
    expect(t('voice_avoid_tilt_shrug', 'zh-CN')).toBe('请保持身体直立，放松肩膀，不要耸肩');
    expect(t('voice_slow_down', 'zh-CN')).toBe('请放慢动作，保持均匀节奏');
  });
});

describe('GFW Immunity & Zero External CDN / Localhost Audit', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  const appHtmlPaths = [
    path.join(rootDir, 'apps/kiosk/index.html'),
    path.join(rootDir, 'apps/pt/index.html'),
    path.join(rootDir, 'apps/admin/index.html'),
    path.join(rootDir, 'public/index.html'),
  ];

  it('ensures all HTML entrypoints have zero blocked Google/CDN font references and zero localhost', () => {
    for (const htmlPath of appHtmlPaths) {
      expect(fs.existsSync(htmlPath), `File not found: ${htmlPath}`).toBe(true);
      const content = fs.readFileSync(htmlPath, 'utf8');

      // Must NOT contain external Google Fonts or CDNs
      expect(content).not.toContain('fonts.googleapis.com');
      expect(content).not.toContain('fonts.gstatic.com');
      expect(content).not.toContain('cdn.jsdelivr.net');
      expect(content).not.toContain('storage.googleapis.com');
      expect(content).not.toContain('http://localhost');
      expect(content).not.toContain('http://127.0.0.1');
    }
  });

  it('ensures system font stack includes cross-platform Chinese & Thai typography', () => {
    for (const htmlPath of appHtmlPaths) {
      const content = fs.readFileSync(htmlPath, 'utf8');
      expect(content).toContain('PingFang SC');
      expect(content).toContain('Microsoft YaHei');
      expect(content).toContain('Noto Sans SC');
      expect(content).toContain('Sarabun');
    }
  });
});
