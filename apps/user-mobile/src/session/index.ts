import { validatePublicApiOrigin } from '../config/public-api-origin.cjs';
import { mobileSecureSessionStore } from './expo-secure-session-store';
import { MobileSessionClient } from './mobile-session-client';

export const mobileSessionClient = new MobileSessionClient({
  apiOrigin: validatePublicApiOrigin(process.env.EXPO_PUBLIC_API_BASE_URL),
  sessionStore: mobileSecureSessionStore,
});

export { MobileApiError, MobileSessionClient } from './mobile-session-client';
export type {
  MobileLoginCredentials,
  MobileSessionSummary,
} from './session-model';
