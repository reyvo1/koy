import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MobileAuthNotice } from '../app/mobile-auth-controller';
import type { MobileLoginCredentials } from '../session';
import { mobileMessages, type MobileLocale } from '../localization/messages';
import { MobileStateNotice } from './mobile-state-notice';

interface MobileLoginScreenProps {
  isDark: boolean;
  locale: MobileLocale;
  notice: MobileAuthNotice | null;
  pending: boolean;
  onSubmit(credentials: MobileLoginCredentials): Promise<void>;
}

export function MobileLoginScreen({
  locale,
  isDark,
  notice,
  pending,
  onSubmit,
}: MobileLoginScreenProps) {
  const copy = mobileMessages[locale];
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit =
    !pending &&
    tenantId.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0;

  async function submit() {
    if (!canSubmit) return;

    const credentials = { tenantId, email, password };
    setPassword('');
    await onSubmit(credentials);
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View
        accessibilityLabel={`${copy.appName}. ${copy.login.title}`}
        style={[styles.card, isDark && styles.cardDark]}
      >
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, isDark && styles.textMutedDark]}>
            {copy.login.eyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, isDark && styles.textDark]}
          >
            {copy.login.title}
          </Text>
          <Text style={[styles.description, isDark && styles.textMutedDark]}>
            {copy.login.description}
          </Text>
        </View>

        {notice ? <MobileStateNotice isDark={isDark} notice={notice} /> : null}

        <View style={styles.form}>
          <Text style={[styles.label, isDark && styles.textDark]}>
            {copy.login.tenantLabel}
          </Text>
          <TextInput
            accessibilityLabel={copy.login.tenantLabel}
            autoCapitalize="none"
            autoComplete="organization"
            editable={!pending}
            onChangeText={setTenantId}
            placeholder={copy.login.tenantPlaceholder}
            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
            style={[styles.input, isDark && styles.inputDark]}
            value={tenantId}
          />

          <Text style={[styles.label, isDark && styles.textDark]}>
            {copy.login.emailLabel}
          </Text>
          <TextInput
            accessibilityLabel={copy.login.emailLabel}
            autoCapitalize="none"
            autoComplete="email"
            editable={!pending}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder={copy.login.emailPlaceholder}
            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
            style={[styles.input, isDark && styles.inputDark]}
            value={email}
          />

          <Text style={[styles.label, isDark && styles.textDark]}>
            {copy.login.passwordLabel}
          </Text>
          <TextInput
            accessibilityLabel={copy.login.passwordLabel}
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!pending}
            onChangeText={setPassword}
            placeholder={copy.login.passwordPlaceholder}
            placeholderTextColor={isDark ? '#94a3b8' : '#64748b'}
            secureTextEntry
            style={[styles.input, isDark && styles.inputDark]}
            value={password}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: pending, disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.button,
            !canSubmit && styles.buttonDisabled,
            pressed && canSubmit && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {pending ? copy.login.pendingAction : copy.login.action}
          </Text>
        </Pressable>

        <Text style={[styles.securityNote, isDark && styles.textMutedDark]}>
          {copy.login.securityNote}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 20,
    borderColor: '#dbe3ef',
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    padding: 22,
  },
  cardDark: {
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  heading: {
    gap: 8,
  },
  eyebrow: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 37,
  },
  description: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
  },
  form: {
    gap: 8,
  },
  label: {
    marginTop: 4,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    minHeight: 50,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  inputDark: {
    borderColor: '#475569',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
  },
  button: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  securityNote: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
  },
  textDark: {
    color: '#f8fafc',
  },
  textMutedDark: {
    color: '#cbd5e1',
  },
});
