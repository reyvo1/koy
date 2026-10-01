import * as SecureStore from 'expo-secure-store';

import { createMobileSettingsStore } from './mobile-settings-store';

/**
 * The Expo-backed settings store.
 *
 * Mirrors `session/expo-secure-session-store.ts` deliberately: the store logic itself takes a port so
 * it can be exercised in plain node, and exactly one module in each folder is allowed to know which
 * secure storage implementation this build runs on. Importing `expo-secure-store` into the shell
 * instead would drag the native module into every component that wanted a locale.
 *
 * The two stores share storage but not keys, so clearing one cannot clear the other — which is the
 * only thing keeping "reset my display settings" from also signing the operator out.
 */
export const mobileSettingsStore = createMobileSettingsStore({
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  isAvailableAsync: () => SecureStore.isAvailableAsync(),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
});