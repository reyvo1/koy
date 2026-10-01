import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const MAX_EVENTS = 20;

/**
 * The event vocabulary, mirrored rather than guessed.
 *
 * `SUBSCRIBABLE_EVENTS` in `src/webhook/webhook.controller.ts` is the only list the backend
 * will accept; the API's own error for an unknown event is a 400 with a message, so an
 * operator who subscribed to `device.statechanged` would find out only after the round trip.
 * The list is duplicated here on purpose — a console that fetched it would have to call the
 * backend before it could render the form, and the cost of a stale second copy is one
 * validation message, not a wrong delivery. `test/webhook-surface.contract.spec.ts` asserts
 * this list still matches the backend's, so the copy cannot drift silently.
 *
 * It did drift once, silently, and that is why the spec exists rather than a comment: this
 * copy offered `device.telemetry.received`, `alert.resolved`, `command.issued`,
 * `command.acknowledged` and `firmware.rollout.progress` — none of which the backend accepts —
 * so an operator ticking "Perintah diterbitkan" was shown a checkbox the product does not
 * support.
 */
const SUBSCRIBABLE_EVENTS = [
  'device.state_changed',
  'device.registered',
  '*',
] as const;

/**
 * POST /api/admin/webhooks/endpoints — register a receiver.
 *
 * `signingSecret` is returned exactly once, by this response, and never again; the console
 * shows it immediately and does not pretend it can be re-read.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ message: 'URL receiver wajib diisi' }, { status: 400 });
  }
  // HTTPS off loopback, or the payload travels in the clear to every observer on the path.
  // The backend enforces the same rule; checking it here means the operator is told before a
  // round trip, not after.
  const isLoopback = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
  if (!/^https:\/\//i.test(url) && !isLoopback) {
    return NextResponse.json(
      { message: 'Webhook di luar loopback wajib memakai https://' },
      { status: 400 },
    );
  }

  const events = Array.isArray(body?.events)
    ? body.events.filter((e): e is string => typeof e === 'string')
    : [];
  if (events.length === 0) {
    return NextResponse.json(
      { message: 'Pilih minimal satu event, atau * untuk semua' },
      { status: 400 },
    );
  }
  if (events.length > MAX_EVENTS) {
    return NextResponse.json(
      { message: `Maksimal ${MAX_EVENTS} event per endpoint` },
      { status: 400 },
    );
  }
  const known = new Set<string>(SUBSCRIBABLE_EVENTS);
  const unknown = events.filter((e) => e !== '*' && !known.has(e));
  if (unknown.length > 0) {
    return NextResponse.json(
      { message: `Event tidak dikenal: ${unknown.join(', ')}`, events: SUBSCRIBABLE_EVENTS },
      { status: 400 },
    );
  }
  // The backend refuses `*` combined with anything else, so the console refuses it here too.
  // Found by driving the form in a real browser: the page's default event plus a ticked
  // wildcard produced exactly this combination and the operator only saw a 400.
  if (events.length > 1 && events.includes('*')) {
    return NextResponse.json(
      { message: 'Event "*" tidak boleh dikombinasikan dengan event lain' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request('/admin/webhooks/endpoints', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, events }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mendaftarkan endpoint webhook' },
  );
}

/** GET /api/admin/webhooks/endpoints — the list. It never contains a signing secret. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/webhooks/endpoints'),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat daftar endpoint webhook' },
  );
}
