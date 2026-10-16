export const mobileMessages = {
  id: {
    appName: 'IoT Platform',
    login: {
      eyebrow: 'Akses pengguna',
      title: 'Masuk ke IoT Platform',
      description:
        'Gunakan tenant ID dan akun terverifikasi. Sesi disimpan hanya di penyimpanan aman perangkat.',
      tenantLabel: 'Tenant ID',
      tenantPlaceholder: 'contoh: tenant-utama',
      emailLabel: 'Email',
      emailPlaceholder: 'nama@contoh.com',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Masukkan password',
      action: 'Masuk',
      pendingAction: 'Memverifikasi…',
      securityNote:
        'Token tidak ditampilkan dan tidak disimpan di konfigurasi publik atau penyimpanan biasa.',
    },
    authenticated: {
      eyebrow: 'Sesi perangkat',
      title: 'Sesi aman aktif',
      description:
        'Autentikasi, pemulihan sesi, dashboard, dan kontrol berizin terhubung melalui API tenant.',
      tenantLabel: 'Tenant aktif',
      statusTitle: 'Sesi perangkat aman',
      statusDescription:
        'Dashboard dan command berizin melewati API tenant. Token tetap berada di penyimpanan aman.',
      logoutAction: 'Keluar',
      pendingLogoutAction: 'Mengakhiri sesi…',
    },
    nav: {
      home: 'Home',
      devices: 'Perangkat',
      realtime: 'Realtime',
      alerts: 'Alerts',
      profile: 'Profil',
      settings: 'Pengaturan',
    },
    settings: {
      title: 'Pengaturan tampilan',
      description:
        'Preferensi tampilan perangkat ini. Tidak memengaruhi channel notifikasi, yang milik tenant.',
      localeLabel: 'Bahasa',
      localeDescription: 'Menentukan seluruh teks antarmuka, termasuk label tab.',
      appearanceLabel: 'Tampilan',
      appearanceDescription: 'Ikuti sistem, atau kunci terang/gelap.',
      appearanceSystem: 'Ikuti sistem',
      appearanceLight: 'Terang',
      appearanceDark: 'Gelap',
      localeUnavailable:
        'Penyimpanan aman tidak tersedia, jadi pilihan tidak dapat dibaca atau disimpan.',
      localeWriteFailed: 'Pilihan tampilan gagal disimpan.',
      localeFallback:
        'Perangkat melaporkan bahasa yang belum punya terjemahan; bahasa bawaan dipakai.',
    },
    panels: {
      deviceDetail: {
        telemetryEmpty: 'Belum ada telemetry terbaru.',
        capabilityEmpty:
          'Tidak ada capability boolean writable. Tipe lain tetap read-only pada Mobile saat ini.',
        commandEmpty: 'Belum ada command.',
        rolloutEmpty: 'Belum ada rollout yang menarget perangkat ini.',
        rolloutCaveat:
          'Rollout state bukan bukti instalasi firmware fisik pada hardware.',
        findingCaveat:
          'Tidak ada finding pada riwayat bounded; bukan jaminan all-clear.',
      },
      alerts: {
        unavailableTitle: 'Alerts tidak tersedia',
        emptyTitle: 'Tidak ada finding WARNING/CRITICAL',
        emptyDescription:
          'Hanya berarti tidak ada finding pada hasil bounded saat ini; bukan jaminan all-clear di luar cakupan riwayat.',
        scopeDescription: 'Cakupan perangkat dibatasi {scope}; hasil tidak boleh diperlakukan sebagai daftar lengkap.',
      },
      delivery: {
        summaryTitle: 'Ringkasan status',
        totalLabel: 'Total tercatat',
      },
    },
    dashboard: {
      title: 'Dashboard',
      loadingDescription: 'Memuat dashboard tenant yang telah diotorisasi.',
      loadingTitle: 'Memuat dashboard',
      loadingMessage: 'Aplikasi sedang membaca dashboard dan data widget.',
      unavailableDescription:
        'Data tetap dibaca melalui API tenant yang terautentikasi.',
      readyDescription:
        'Ringkasan capability-driven dari tenant aktif; kontrol hanya muncul bila akun memiliki izin CONTROL.',
      retryAction: 'Muat ulang dashboard',
      selectorLabel: 'Pilih dashboard',
      selectorAccessibilityLabel: 'Daftar dashboard',
      offlineCachedTitle: 'Mode offline',
      offlineCachedPrefix: 'Data tersimpan dari',
      emptyTitle: 'Belum ada dashboard',
      emptyMessage: 'Tenant ini belum memiliki dashboard yang dapat dibaca.',
      refreshAction: 'Perbarui data',
      switchDisabled:
        'Kontrol tidak tersedia untuk akun atau binding ini. Tidak ada command yang dikirim.',
      switchOnAction: 'Aktifkan',
      switchOffAction: 'Nonaktifkan',
      switchPending: 'Mengirim command…',
      switchReady:
        'Kontrol mengirim nilai eksplisit; status aktual menunggu ACK/telemetry perangkat.',
      switchSent: 'Perintah diterima. Status aktual tetap mengikuti ACK/telemetry perangkat.',
      switchAcknowledged: 'Perangkat mengonfirmasi command. Dashboard telah dimuat ulang dari data terotorisasi.',
      switchRejected: 'Perangkat melaporkan command gagal. UI tidak mengubah status perangkat secara asumsi.',
      switchTimedOut: 'Command tidak mendapat ACK sebelum batas waktu. Status aktual tetap mengikuti telemetry.',
      switchAwaitingAck: 'Command masih menunggu ACK perangkat; UI tidak mengasumsikan status sudah berubah.',
      switchFailed: 'Perintah perangkat gagal dikirim.',
      mapUnsupported:
        'Widget peta tetap fail-closed sampai kontrak lokasi disetujui.',
      invalidData: 'Data widget tidak dapat digunakan saat ini.',
      unsupportedData: 'Jenis atau binding widget ini belum didukung.',
      emptyData: 'Belum ada data untuk widget ini.',
      unavailableData: 'Data belum tersedia.',
      numericUnavailable: 'Nilai numerik belum tersedia.',
      seriesUnavailable: 'Belum ada titik data.',
      seriesAccessibilityLabel: 'Data grafik terbaru',
      updatedPrefix: 'Diperbarui',
      unknownTime: 'waktu tidak diketahui',
      valueUnavailable: 'Tidak tersedia',
      valueAvailable: 'Data tersedia',
      activeValue: 'Aktif',
      inactiveValue: 'Nonaktif',
      stateLabels: {
        READY: 'Siap',
        EMPTY: 'Kosong',
        STALE: 'Perlu diperbarui',
        INVALID: 'Tidak valid',
        UNSUPPORTED: 'Belum didukung',
        ERROR: 'Gangguan',
      },
      kindLabels: {
        CARD: 'Ringkasan',
        SWITCH: 'Kontrol',
        GAUGE: 'Pengukur',
        CHART: 'Grafik',
        MAP: 'Peta',
        TABLE: 'Tabel',
        STATUS: 'Status',
      },
    },
  },
  en: {
    appName: 'IoT Platform',
    login: {
      eyebrow: 'User access',
      title: 'Sign in to IoT Platform',
      description:
        'Use a tenant ID and verified account. The session is stored only in secure device storage.',
      tenantLabel: 'Tenant ID',
      tenantPlaceholder: 'example: primary-tenant',
      emailLabel: 'Email',
      emailPlaceholder: 'name@example.com',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter password',
      action: 'Sign in',
      pendingAction: 'Verifying…',
      securityNote:
        'Tokens are never displayed or stored in public configuration or ordinary storage.',
    },
    authenticated: {
      eyebrow: 'Device session',
      title: 'Secure session active',
      description:
        'Authentication, session restoration, dashboards, and authorized control are connected through the tenant API.',
      tenantLabel: 'Active tenant',
      statusTitle: 'Secure device session',
      statusDescription:
        'Dashboards and authorized commands use the tenant API. Tokens remain in secure storage.',
      logoutAction: 'Sign out',
      pendingLogoutAction: 'Ending session…',
    },
    nav: {
      home: 'Home',
      devices: 'Devices',
      realtime: 'Realtime',
      alerts: 'Alerts',
      profile: 'Profile',
      settings: 'Settings',
    },
    settings: {
      title: 'Display settings',
      description:
        'Display preferences for this device. They do not change notification channels, which belong to the tenant.',
      localeLabel: 'Language',
      localeDescription: 'Determines all interface text, including the tab labels.',
      appearanceLabel: 'Appearance',
      appearanceDescription: 'Follow the system, or pin light or dark.',
      appearanceSystem: 'Follow system',
      appearanceLight: 'Light',
      appearanceDark: 'Dark',
      localeUnavailable:
        'Secure storage is unavailable, so choices cannot be read or saved.',
      localeWriteFailed: 'The display choice could not be saved.',
      localeFallback:
        'The device reports a language this build has no copy for; the default is used.',
    },
    panels: {
      deviceDetail: {
        telemetryEmpty: 'No recent telemetry yet.',
        capabilityEmpty:
          'No writable boolean capability. Other types stay read-only on Mobile for now.',
        commandEmpty: 'No commands yet.',
        rolloutEmpty: 'No rollout targets this device yet.',
        rolloutCaveat: 'Rollout state is not proof of physical firmware installation.',
        findingCaveat: 'No findings in the bounded history; that is not an all-clear.',
      },
      alerts: {
        unavailableTitle: 'Alerts are unavailable',
        emptyTitle: 'No WARNING/CRITICAL findings',
        emptyDescription:
          'This only means no findings within the current bounded results; it is not an all-clear beyond that window.',
        scopeDescription: 'Device scope is limited to {scope}; results must not be read as a complete list.',
      },
      delivery: {
        summaryTitle: 'Status summary',
        totalLabel: 'Total recorded',
      },
    },
    dashboard: {
      title: 'Dashboard',
      loadingDescription: 'Loading tenant-authorized dashboards.',
      loadingTitle: 'Loading dashboard',
      loadingMessage: 'The app is reading the dashboard and widget data.',
      unavailableDescription:
        'Data remains bound to the authenticated tenant API.',
      readyDescription:
        'A capability-driven summary for the active tenant; controls appear only with CONTROL permission.',
      retryAction: 'Reload dashboard',
      selectorLabel: 'Choose dashboard',
      selectorAccessibilityLabel: 'Dashboard list',
      offlineCachedTitle: 'Offline mode',
      offlineCachedPrefix: 'Cached data from',
      emptyTitle: 'No dashboards yet',
      emptyMessage: 'This tenant has no dashboard available to read.',
      refreshAction: 'Refresh data',
      switchDisabled: 'Control is unavailable for this account or binding. No command has been sent.',
      switchOnAction: 'Turn on',
      switchOffAction: 'Turn off',
      switchPending: 'Sending command…',
      switchReady:
        'Controls send explicit values; actual state waits for device ACK/telemetry.',
      switchSent: 'Command accepted. Actual state still follows device ACK/telemetry.',
      switchAcknowledged: 'The device acknowledged the command. The dashboard has been refreshed from authorized data.',
      switchRejected: 'The device reported that the command failed. The UI did not assume a new device state.',
      switchTimedOut: 'The command did not receive an ACK before timeout. Actual state still follows telemetry.',
      switchAwaitingAck: 'The command is still waiting for device ACK; the UI does not assume the state changed.',
      switchFailed: 'The device command could not be sent.',
      mapUnsupported:
        'Map widgets remain fail-closed until the location contract is approved.',
      invalidData: 'Widget data cannot be used right now.',
      unsupportedData: 'This widget type or binding is not supported yet.',
      emptyData: 'No data is available for this widget yet.',
      unavailableData: 'Data is not available yet.',
      numericUnavailable: 'A numeric value is not available yet.',
      seriesUnavailable: 'No data points are available yet.',
      seriesAccessibilityLabel: 'Latest chart data',
      updatedPrefix: 'Updated',
      unknownTime: 'unknown time',
      valueUnavailable: 'Unavailable',
      valueAvailable: 'Data available',
      activeValue: 'Active',
      inactiveValue: 'Inactive',
      stateLabels: {
        READY: 'Ready',
        EMPTY: 'Empty',
        STALE: 'Needs refresh',
        INVALID: 'Invalid',
        UNSUPPORTED: 'Unsupported',
        ERROR: 'Error',
      },
      kindLabels: {
        CARD: 'Summary',
        SWITCH: 'Control',
        GAUGE: 'Gauge',
        CHART: 'Chart',
        MAP: 'Map',
        TABLE: 'Table',
        STATUS: 'Status',
      },
    },
  },
} as const;

export type MobileLocale = keyof typeof mobileMessages;

/**
 * The locales this build actually has copy for, in the order the picker offers them.
 *
 * `id` leads because it is the platform's language of record, not because it is a better default —
 * `defaultMobileLocale` says which one a fresh install uses.
 */
export const MOBILE_LOCALES = ['id', 'en'] as const satisfies ReadonlyArray<MobileLocale>;

/**
 * Exact match only, and that is the point.
 *
 * A permissive match here is how a picker ends up lying: the operator asks for something the app has
 * no copy for, the lookup quietly returns `id`, and every later screen answers in Indonesian while
 * the picker still shows their unsupported tag selected. Refusing is recoverable; a silent fallback
 * is not. Regional tags are handled by `normalizeMobileLocale`, which reports the guess it made.
 */
export function isMobileLocale(candidate: unknown): candidate is MobileLocale {
  return (
    typeof candidate === 'string' &&
    (MOBILE_LOCALES as ReadonlyArray<string>).includes(candidate)
  );
}

/**
 * Resolve a device language tag to a locale, reporting whether the tag was honoured.
 *
 * The one guess made is the language subtag, because `en-GB` really is English and refusing it would
 * be pedantry that teaches operators the picker is broken. `matched: false` is the load-bearing
 * part: it tells the UI to say the app fell back, instead of presenting an approximation as the
 * operator's choice.
 */
export function normalizeMobileLocale(tag: unknown): {
  locale: MobileLocale;
  matched: boolean;
} {
  if (isMobileLocale(tag)) return { locale: tag, matched: true };

  if (typeof tag === 'string') {
    const language = tag.split('-')[0]?.toLowerCase();
    if (isMobileLocale(language)) return { locale: language, matched: false };
  }

  return { locale: defaultMobileLocale, matched: false };
}

export const defaultMobileLocale: MobileLocale = 'id';
