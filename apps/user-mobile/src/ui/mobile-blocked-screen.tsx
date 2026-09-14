import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileAuthNotice } from '../app/mobile-auth-controller';
import { MobileStateNotice } from './mobile-state-notice';

interface MobileBlockedScreenProps {
  isDark: boolean;
  notice: MobileAuthNotice;
  onRetry(): Promise<void>;
}

export function MobileBlockedScreen({
  isDark,
  notice,
  onRetry,
}: MobileBlockedScreenProps) {
  return (
    <View style={styles.content}>
      <MobileStateNotice isDark={isDark} notice={notice} />
      <Pressable
        accessibilityRole="button"
        onPress={() => void onRetry()}
        style={({ pressed }) => [
          styles.button,
          isDark && styles.buttonDark,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={[styles.buttonText, isDark && styles.textDark]}>
          Coba lagi
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 16,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#94a3b8',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonDark: {
    borderColor: '#475569',
    backgroundColor: '#1e293b',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  textDark: {
    color: '#f8fafc',
  },
});
