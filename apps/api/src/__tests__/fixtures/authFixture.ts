import { setAuthTokenVerifier, resetAuthTestState } from '../../middleware/authenticate';

export function setupTestAuthFixture(): void {
  setAuthTokenVerifier(async (token: string) => {
    if (!token.startsWith('mock-token:')) {
      return null;
    }
    const parts = token.split(':');
    if (parts.length < 3) {
      return null;
    }
    const id = parts[1];
    const role = parts[2];
    const status = parts[3] || 'active';
    const extra = parts[4];
    return {
      id,
      role,
      full_name: `${role.toUpperCase()} User ${id}`,
      status,
      force_logout_at: extra === 'revoked' ? new Date(Date.now() + 60000).toISOString() : null,
    };
  });
}

export function teardownTestAuthFixture(): void {
  setAuthTokenVerifier(null);
  resetAuthTestState();
}
