import { StyleSheet, Text, View } from 'react-native';

import type { MobileAuthNotice } from '../app/mobile-auth-controller';

interface MobileStateNoticeProps {
  isDark: boolean;
  notice: MobileAuthNotice;
}

export function MobileStateNotice({ isDark, notice }: MobileStateNoticeProps) {
  const toneStyle = (() => {
    if (isDark) {
      if (notice.tone === 'offline') return styles.noticeOfflineDark;
      if (notice.tone === 'warning') return styles.noticeWarningDark;
      return styles.noticeDark;
    }
    if (notice.tone === 'offline') return styles.noticeOffline;
    if (notice.tone === 'warning') return styles.noticeWarning;
    return null;
  })();

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.notice, toneStyle]}
    >
      <Text style={[styles.title, isDark && styles.textDark]}>
        {notice.title}
      </Text>
      <Text style={[styles.message, isDark && styles.textMutedDark]}>
        {notice.message}
      </Text>
      {notice.requestId ? (
        <Text style={[styles.reference, isDark && styles.textMutedDark]}>
          Referensi: {notice.requestId}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: 6,
    borderColor: '#fecaca',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#fef2f2',
    padding: 14,
  },
  noticeOffline: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  noticeWarning: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  noticeDark: {
    borderColor: '#7f1d1d',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  noticeOfflineDark: {
    borderColor: '#1e3a8a',
    backgroundColor: 'rgba(96, 165, 250, 0.12)',
  },
  noticeWarningDark: {
    borderColor: '#92400e',
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
  },
  title: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    color: '#7f1d1d',
    fontSize: 14,
    lineHeight: 21,
  },
  reference: {
    color: '#7f1d1d',
    fontSize: 12,
  },
  textDark: {
    color: '#f8fafc',
  },
  textMutedDark: {
    color: '#cbd5e1',
  },
});
