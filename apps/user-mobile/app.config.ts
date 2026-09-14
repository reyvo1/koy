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
    ios: {
      ...config.ios,
      supportsTablet: true,
    },
    android: {
      package: 'com.reyvo.iotplatform',
      ...config.android,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      ...(config.plugins ?? []),
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
