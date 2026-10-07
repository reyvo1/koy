'use client';
import { useState } from 'react';
import { CapabilityValueInput } from '@iot-platform/design-system';
import { parseCapabilityValue } from '../../../packages/sdk/src/capability-value';
import type { UserDeviceCapability } from '../lib/contracts';

export function CapabilityControl({
  capability,
  busy,
  onSend,
}: {
  capability: UserDeviceCapability;
  busy: boolean;
  onSend(value: unknown): Promise<void>;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const supported = [
    'boolean',
    'integer',
    'number',
    'string',
    'enum',
    'object',
  ].includes(capability.dataType.toLowerCase());
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseCapabilityValue(raw, capability);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setError(null);
        void onSend(parsed.value);
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4"
    >
      <label className="min-w-[180px] flex-1 text-sm font-semibold text-slate-800">
        {capability.semanticType || capability.key}
        {capability.unit ? ` (${capability.unit})` : ''}
        <CapabilityValueInput
          capability={capability}
          value={raw}
          onChange={setRaw}
          disabled={busy || !supported}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !supported}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Mengirim…' : 'Kirim'}
      </button>
      {error || !supported ? (
        <p role="alert" className="m-0 w-full text-sm text-red-700">
          {error ?? 'Tipe capability belum didukung.'}
        </p>
      ) : null}
    </form>
  );
}
