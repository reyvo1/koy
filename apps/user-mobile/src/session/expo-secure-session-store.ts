import * as SecureStore from 'expo-secure-store';

import { createMobileSecureSessionStore } from './secure-session-store';

export const mobileSecureSessionStore = createMobileSecureSessionStore({
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  isAvailableAsync: () => SecureStore.isAvailableAsync(),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
});
