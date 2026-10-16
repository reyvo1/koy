import type { ConfigContext, ExpoConfig } from 'expo/config';

import { validatePublicApiOrigin } from './src/config/public-api-origin.cjs';

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiBaseUrl = validatePublicApiOrigin(
    process.env.EXPO_PUBLIC_API_BASE_URL,
  );

  return {
    ...config,
    name: 'IoT Platform',
    slug: 'iot-platform-user-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    ios: {
      ...config.ios,
      supportsTablet: true,
    },
    android: {
      package: 'com.reyvo.iotplatform',
      ...config.android,
      adaptiveIcon: {
        backgroundColor: '#0f766e',
        foregroundImage: './assets/adaptive-icon.png',
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0f766e',
          dark: {
            backgroundColor: '#111827',
          },
          image: './assets/splash-icon.png',
          imageWidth: 180,
          resizeMode: 'contain',
        },
      ],
      [
        'expo-secure-store',
        {
          configureAndroidBackup: true,
        },
      ],
    ],
    extra: {
      ...config.extra,
      apiBaseUrl,
    },
  };
};
