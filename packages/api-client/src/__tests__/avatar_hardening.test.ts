import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../index.js';

describe('Profile Avatar Hardening & Base64 Egress Leak Prevention', () => {
  let client: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ApiClient();
    client.setUserProfile({
      id: 'b1000000-0000-0000-0000-000000000003',
      username: 'pt_somchai',
      full_name: 'กภ. วิภาวี สุขใจ',
      role: 'pt',
      status: 'active',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should reject files exceeding 2 MB size limit', async () => {
    const hugeBlob = new Blob([new Uint8Array(2 * 1024 * 1024 + 10)], { type: 'image/jpeg' });
    await expect(
      client.staff.uploadAvatar('b1000000-0000-0000-0000-000000000003', hugeBlob)
    ).rejects.toThrow('ขนาดไฟล์ภาพเกิน 2 MB');
  });

  it('should reject files with invalid magic bytes (e.g. text/exe pretending to be jpg)', async () => {
    const fakeJpg = new Blob(['MZ this is an executable not a jpeg'], { type: 'image/jpeg' });
    await expect(
      client.staff.uploadAvatar('b1000000-0000-0000-0000-000000000003', fakeJpg)
    ).rejects.toThrow('ชนิดไฟล์ไม่ถูกต้อง');
  });

  it('should NEVER store raw Base64 data URLs in PostgreSQL columns when Supabase storage upload fails', async () => {
    // Valid JPEG magic header: FF D8 FF E0
    const validJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const validJpegBlob = new Blob([validJpegBytes], { type: 'image/jpeg' });

    // Mock fetch to simulate Storage failure (Bucket not found / 404 / 403)
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/storage/v1/object/avatars/')) {
        return {
          ok: false,
          status: 404,
          statusText: 'NoSuchBucket',
          text: async () => '{"message":"Bucket not found"}',
          json: async () => ({ message: 'Bucket not found' }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '[]',
        json: async () => [],
      };
    }) as any;

    // Must fail closed with clear error, strictly refusing to convert to raw Base64
    await expect(
      client.staff.uploadAvatar('b1000000-0000-0000-0000-000000000003', validJpegBlob)
    ).rejects.toThrow(/ไม่สามารถอัปโหลดรูปภาพไปยัง Supabase Storage/);
  });

  it('should upload valid image to staff/${userId}-${timestamp}.ext and store clean short URL', async () => {
    // Valid WebP magic header: RIFF....WEBP
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
    ]);
    const webpBlob = new Blob([webpBytes], { type: 'image/webp' });

    let capturedStorageUrl = '';
    let capturedPatchBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (url.includes('/storage/v1/object/avatars/')) {
        capturedStorageUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => '{}',
          json: async () => ({}),
        };
      }
      if (url.includes('/storage/v1/object/list/avatars')) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }
      if (url.includes('/rest/v1/profiles?id=eq.')) {
        capturedPatchBody = JSON.parse(options?.body || '{}');
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'b1000000-0000-0000-0000-000000000003',
              avatar_url: capturedPatchBody?.avatar_url,
            },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '[]',
        json: async () => [],
      };
    }) as any;

    const res = await client.staff.uploadAvatar('b1000000-0000-0000-0000-000000000003', webpBlob);
    expect(res.ok).toBe(true);
    expect(capturedStorageUrl).toMatch(/\/storage\/v1\/object\/avatars\/staff\/b1000000-0000-0000-0000-000000000003-\d+\.webp/);
    expect(capturedPatchBody.avatar_url).toMatch(/\/storage\/v1\/object\/public\/avatars\/staff\/b1000000-0000-0000-0000-000000000003-\d+\.webp/);
    expect(capturedPatchBody.avatar_url.startsWith('data:')).toBe(false);
  });
});
