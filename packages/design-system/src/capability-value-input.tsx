'use client';

import {
  capabilityNumberInputProps,
  readCapabilityConstraints,
} from '../../sdk/src/capability-value';

interface CapabilityLike {
  dataType?: string | null;
  constraints?: unknown;
}

interface Props {
  capability?: CapabilityLike | null;
  value: string;
  onChange: (value: string) => void;
  className: string;
  disabled?: boolean;
  placeholder?: string;
}

export function CapabilityValueInput({
  capability,
  value,
  onChange,
  className,
  disabled = false,
  placeholder = 'Nilai',
}: Props) {
  const dataType = String(capability?.dataType ?? '').toLowerCase();
  const constraints = readCapabilityConstraints(capability?.constraints);

  if (dataType === 'boolean') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={className}
      >
        <option value="">Nilai…</option>
        <option value="true">TRUE</option>
        <option value="false">FALSE</option>
      </select>
    );
  }

  if (dataType === 'enum') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={className}
      >
        <option value="">Pilih nilai…</option>
        {(constraints.enumValues ?? []).map((entry, index) => (
          <option key={`${String(entry)}-${index}`} value={String(entry)}>
            {String(entry)}
          </option>
        ))}
      </select>
    );
  }

  if (dataType === 'integer' || dataType === 'number') {
    const numberProps = capabilityNumberInputProps(capability ?? {});
    return (
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        min={numberProps.min}
        max={numberProps.max}
        step={numberProps.step}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  if (dataType === 'object') {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={2}
        placeholder='{"key":"value"}'
        className={className}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  );
}
