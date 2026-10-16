import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MOBILE_LOCALES, mobileMessages, type MobileLocale } from '../localization/messages';
import type { MobileAppearance } from '../settings/mobile-settings-store';
import { mobilePalette, type MobilePalette } from './mobile-theme';

/**
 * The display-settings half of the profile screen.
 *
 * Both choices here are about this device: the language the copy is written in, and whether the app
 * follows the system colour scheme. Neither is a notification preference — that is a per-membership
 * question the backend answers, and putting a channel switch on a phone that does not own the
 * subscription would be a control that cannot be honoured. The description says so, because a
 * settings screen that quietly omits the thing operators look for is worse than one that names it.
 *
 * Three states are rendered as three things, never two:
 *
 *  - **`storageUnavailable`** — the secure store could not be read. This is *not* the same as "on
 *    defaults": one is a fact about the world, the other is a fact about our ability to know. Showing
 *    "Bahasa: Indonesia" as a current selection here is a claim the app cannot support.
 *  - **A failed write** — the choice the operator just made did not land. The failure is stated,
 *    because a toggle that appears to take and silently reverts on the next launch is indistinguishable
 *    from settings that do not work at all.
 *  - **A real selection** — only once a stored value backs it.
 */
export function MobileSettingsPanel({
  appearance,
  error,
  isDark,
  locale,
  onSelectAppearance,
  onSelectLocale,
  storageUnavailable,
}: {
  appearance: MobileAppearance;
  error: string | null;
  isDark: boolean;
  locale: MobileLocale;
  onSelectAppearance(appearance: MobileAppearance): void;
  onSelectLocale(locale: MobileLocale): void;
  storageUnavailable: boolean;
}) {
  const copy = mobileMessages[locale];
  const styles = createStyles(mobilePalette(isDark));

  const appearances: ReadonlyArray<{
    key: MobileAppearance;
    label: string;
  }> = [
    { key: 'system', label: copy.settings.appearanceSystem },
    { key: 'light', label: copy.settings.appearanceLight },
    { key: 'dark', label: copy.settings.appearanceDark },
  ];

  return (
    <View style={styles.gap}>
      <View style={styles.card}>
        <Text style={styles.title}>{copy.settings.title}</Text>
        <Text style={styles.meta}>{copy.settings.description}</Text>
      </View>

      {storageUnavailable ? (
        // Rendered instead of the pickers, not above them: a control that cannot save is not a
        // control, and offering it anyway invites the operator to believe the choice took.
        <View style={[styles.card, styles.cardWarning]}>
          <Text style={styles.titleWarning}>{copy.settings.localeUnavailable}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.title}>{copy.settings.localeLabel}</Text>
        <Text style={styles.meta}>{copy.settings.localeDescription}</Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {MOBILE_LOCALES.map((candidate) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: candidate === locale, disabled: storageUnavailable }}
              disabled={storageUnavailable}
              key={candidate}
              onPress={() => onSelectLocale(candidate)}
              style={({ pressed }) => [
                styles.choice,
                candidate === locale && styles.choiceSelected,
                storageUnavailable && styles.choiceDisabled,
                pressed && styles.choicePressed,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  candidate === locale && styles.choiceTextSelected,
                ]}
              >
                {candidate === 'id' ? 'Bahasa Indonesia' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{copy.settings.appearanceLabel}</Text>
        <Text style={styles.meta}>{copy.settings.appearanceDescription}</Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {appearances.map((item) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: item.key === appearance, disabled: storageUnavailable }}
              disabled={storageUnavailable}
              key={item.key}
              onPress={() => onSelectAppearance(item.key)}
              style={({ pressed }) => [
                styles.choice,
                item.key === appearance && styles.choiceSelected,
                storageUnavailable && styles.choiceDisabled,
                pressed && styles.choicePressed,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  item.key === appearance && styles.choiceTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <View style={[styles.card, styles.cardWarning]}>
          <Text style={styles.titleWarning}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: MobilePalette) {
  return StyleSheet.create({
    gap: { gap: 12 },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      padding: 14,
      gap: 8,
    },
    cardWarning: {
      borderColor: palette.warning,
      backgroundColor: palette.warningSoft,
    },
    title: { fontSize: 14, fontWeight: '700', color: palette.textStrong },
    titleWarning: { fontSize: 13, fontWeight: '600', color: palette.warning },
    meta: { fontSize: 12, lineHeight: 17, color: palette.muted },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    choice: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    choiceSelected: {
      borderColor: palette.accent,
      backgroundColor: palette.accentSoft,
    },
    choiceDisabled: { opacity: 0.4 },
    choicePressed: { opacity: 0.75 },
    choiceText: { fontSize: 12.5, fontWeight: '600', color: palette.text },
    choiceTextSelected: { color: palette.accent },
  });
}
