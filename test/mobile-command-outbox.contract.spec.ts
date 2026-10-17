import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mobile offline command outbox contract', () => {
  const root = resolve(__dirname, '..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const offlineDir = resolve(root, 'apps/user-mobile/src/offline');
  const store = read('apps/user-mobile/src/offline/mobile-command-outbox.ts');
  const bridge = read('apps/user-mobile/src/offline/mobile-offline-commands.ts');
  const adapter = read('apps/user-mobile/src/offline/expo-sqlite-outbox-store.ts');
  const database = read('apps/user-mobile/src/offline/expo-sqlite-database.ts');
  const deviceClient = read('apps/user-mobile/src/device-control/mobile-device-client.ts');
  const app = read('apps/user-mobile/App.tsx');
  const screen = read('apps/user-mobile/src/ui/mobile-dashboard-screen.tsx');
  const shell = read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx');
  const widget = read('apps/user-mobile/src/ui/mobile-dashboard-widget.tsx');
  const messages = read('apps/user-mobile/src/localization/messages.ts');

  it('keeps the sqlite native import in exactly one module directory-wide', () => {
    const importers = readdirSync(offlineDir)
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .filter((name) => readFileSync(resolve(offlineDir, name), 'utf8').includes("from 'expo-sqlite'"));
    expect(importers).toEqual(['expo-sqlite-database.ts']);
    expect(adapter).toContain("from './expo-sqlite-database'");
    expect(store).not.toContain("from 'expo-sqlite'");
    expect(bridge).not.toContain("from 'expo-sqlite'");
  });

  it('shares one database with one outbox table', () => {
    expect(database).toContain('OFFLINE_OUTBOX_TABLE');
    expect(database).toContain("'mobile_outbox'");
    expect(adapter).toContain('OFFLINE_OUTBOX_TABLE');
  });

  it('bounds the queue by entries, attempts, and value bytes', () => {
    expect(store).toContain('MAX_OUTBOX_ENTRIES = 16');
    expect(store).toContain('MAX_OUTBOX_ATTEMPTS = 5');
    expect(store).toContain('MAX_OUTBOX_VALUE_BYTES = 4096');
    expect(store).toContain('Number.isFinite');
  });

  it('reuses one stored idempotency key per queued command', () => {
    expect(store).toContain('mobile-outbox-');
    expect(deviceClient).toContain('idempotencyKey?: string');
    expect(deviceClient).toContain('idempotencyKey ??');
    expect(app).toContain('entry.idempotencyKey');
  });

  it('supersedes same-control intents instead of stacking duplicates', () => {
    expect(store).toContain('superseded');
    expect(store).toContain('replaced');
  });

  it('treats only unreachable answers as offline and stops on transient failures', () => {
    expect(bridge).toContain("cause.status === 0 || cause.code === 'MOBILE_API_UNREACHABLE'");
    expect(bridge).toContain('cause.status === 0 || cause.status === 429 || cause.status >= 500');
  });

  it('wires enqueue, flush, retry, discard, and logout clearing in the app', () => {
    expect(app).toContain('connectMobileCommandOutbox');
    expect(app).toContain('isMobileOfflineError');
    expect(app).toContain('offlineOutbox.enqueue(');
    expect(app).toContain('offlineOutbox.flush(');
    expect(app).toContain('offlineOutbox.retryFailed(');
    expect(app).toContain('offlineOutbox.discardFailed(');
    expect(app).toContain('offlineOutbox.forget()');
    expect(app).toContain('offlineOutbox.summary(');
    expect(app).toContain("'QUEUED_OFFLINE'");
  });

  it('threads the outbox through the shell into the dashboard screen', () => {
    expect(shell).toContain('outbox: MobileOutboxSummary');
    expect(shell).toContain('outbox={outbox}');
    expect(shell).toContain('onFlushOutbox={onFlushOutbox}');
    expect(shell).toContain('onDiscardFailed={onDiscardFailed}');
    expect(screen).toContain('outboxPendingPrefix');
    expect(screen).toContain('outboxFailedPrefix');
    expect(screen).toContain('outboxFlushAction');
    expect(screen).toContain('outboxDiscardAction');
  });

  it('drains the queue on app resume and while entries wait, without connectivity probing', () => {
    const drainScheduler = read(
      'apps/user-mobile/src/offline/mobile-outbox-drain-scheduler.ts',
    );
    expect(drainScheduler).toContain('OUTBOX_DRAIN_INTERVAL_MS = 60_000');
    expect(drainScheduler).toContain('onAppActive');
    expect(drainScheduler).toContain('setPending');
    expect(drainScheduler).toContain('dispose');
    expect(drainScheduler).not.toMatch(/NetInfo|expo-network/);
    expect(app).toContain('createMobileOutboxDrainScheduler');
    expect(app).toContain('flushOutboxNowRef');
    expect(app).toContain('AppState.addEventListener');
    expect(app).toContain("next === 'active'");
    expect(app).toContain('outboxDrainScheduler.setPending(outboxSummary.pending > 0)');
    expect(app).toContain('outboxDrainScheduler.onAppActive()');
    expect(app).toContain('outboxDrainScheduler.dispose()');
  });

  it('shows the queued rows themselves, not just the counters', () => {
    expect(bridge).toContain('async function list(tenantId: string)');
    expect(bridge).toContain('async function discard(tenantId: string, entryIds: string[])');
    expect(bridge).toContain('async function retry(tenantId: string, entryId: string)');
    expect(app).toContain('offlineOutbox.list(');
    expect(app).toContain('offlineOutbox.retry(');
    expect(app).toContain('offlineOutbox.discard(');
    expect(app).toContain('setOutboxEntries(');
    expect(app).toContain('outboxEntries={outboxEntries}');
    expect(shell).toContain('outboxEntries: MobileOutboxEntry[]');
    expect(shell).toContain('onRetryQueuedCommand');
    expect(shell).toContain('onDiscardQueuedCommand');
    expect(screen).toContain('entries: MobileOutboxEntry[]');
    expect(screen).toContain('formatOutboxValue');
    expect(screen).toContain('outboxRowQueued');
    expect(screen).toContain('outboxRowFailed');
    expect(screen).toContain('outboxRowRetryAction');
    expect(screen).toContain('outboxRowDiscardAction');
    expect(screen).toContain('outboxMoreLabel');
    expect(messages).toContain("outboxRowDiscardAction: 'Buang'");
    expect(messages).toContain("outboxRowDiscardAction: 'Discard'");
  });

  it('shows queued commands as queued, not sent, and localizes both locales', () => {
    expect(widget).toContain("case 'QUEUED_OFFLINE'");
    expect(widget).toContain('switchQueuedOffline');
    expect(messages).toContain('switchQueuedOffline');
    expect(messages).toContain('Perintah menunggu koneksi');
    expect(messages).toContain('Commands waiting for connectivity');
    expect(messages).toContain('Tidak ada koneksi');
    expect(messages).toContain('No connection');
  });

  it('adds no web or insecure storage', () => {
    for (const source of [store, bridge, adapter, database, app]) {
      expect(source).not.toMatch(/AsyncStorage|localStorage|sessionStorage/);
    }
  });
});
