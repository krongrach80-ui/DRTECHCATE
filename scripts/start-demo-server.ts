import { createApp } from '../apps/api/src/app';
import { AuthService, AuthSignInFn } from '../apps/api/src/modules/auth/service';
import { AuthRepository } from '../apps/api/src/modules/auth/repository';
import { AuthController } from '../apps/api/src/modules/auth/controller';

// Set fixture environment
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
process.env.FACE_T_ACCEPT = '0.60';
process.env.FACE_T_REJECT = '0.45';
process.env.FACE_T_MARGIN = '0.10';
process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
process.env.FACE_T_DUPLICATE = '0.85';
process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
process.env.KIOSK_PAIRING_SECRET = 'test-kiosk-pairing-hmac-secret-16chars';

const mockProfile = {
  id: 'pt-somchai-uuid',
  role: 'pt',
  first_name: 'Somchai',
  last_name: 'Jaidee',
  status: 'active',
  force_logout_at: null,
};

const mockSignIn: AuthSignInFn = async ({ email, password }) => {
  if (email.startsWith('pt_somchai@') && password === 'CorrectPassword123!') {
    return {
      data: {
        user: { id: 'pt-somchai-uuid', email },
        session: {
          access_token: 'mock-token:pt-somchai-uuid:pt:active',
          refresh_token: 'mock-refresh-token-456',
          expires_in: 3600,
        },
      },
      error: null,
    };
  }
  return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
};

const authRepo = new AuthRepository();
authRepo.getProfileById = async (id: string) => (id === 'pt-somchai-uuid' ? mockProfile : null);
authRepo.forceLogout = async () => {};

const authService = new AuthService(authRepo, mockSignIn);
const authController = new AuthController(authService);

const app = createApp(undefined, authController);

const server = app.listen(3001, () => {
  console.log('DEMO_SERVER_READY_ON_PORT_3001');
});

const cleanup = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
