export interface CapabilityValueContract {
  dataType?: string | null;
  constraints?: unknown;
}

export interface CapabilityConstraints {
  min?: number;
  max?: number;
  precision?: number;
  enumValues?: Array<string | number | boolean>;
}

export type CapabilityValueResult =
  | { ok: true; value: string | number | boolean | Record<string, unknown> }
  | { ok: false; error: string };

export function readCapabilityConstraints(
  value: unknown,
): CapabilityConstraints {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: CapabilityConstraints = {};

  if (typeof source.min === 'number' && Number.isFinite(source.min))
    result.min = source.min;
  if (typeof source.max === 'number' && Number.isFinite(source.max))
    result.max = source.max;
  if (
    typeof source.precision === 'number' &&
    Number.isInteger(source.precision) &&
    source.precision >= 0 &&
    source.precision <= 15
  ) {
    result.precision = source.precision;
  }
  if (
    Array.isArray(source.enumValues) &&
    source.enumValues.every(
      (entry) =>
        typeof entry === 'string' ||
        typeof entry === 'number' ||
        typeof entry === 'boolean',
    )
  ) {
    result.enumValues = source.enumValues as Array<string | number | boolean>;
  }

  return result;
}

export function parseCapabilityValue(
  raw: string,
  capability: CapabilityValueContract,
): CapabilityValueResult {
  if (raw.length > 16384)
    return { ok: false, error: 'Nilai terlalu panjang (maksimum 16 KiB).' };
  const dataType = String(capability.dataType ?? '').toLowerCase();
  const constraints = readCapabilityConstraints(capability.constraints);

  switch (dataType) {
    case 'boolean':
      if (raw === 'true') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false, error: 'Nilai boolean harus true atau false.' };

    case 'integer': {
      if (!/^-?\d+$/.test(raw.trim()))
        return { ok: false, error: 'Nilai harus berupa integer.' };
      const value = Number(raw);
      if (!Number.isSafeInteger(value))
        return { ok: false, error: 'Integer di luar rentang aman.' };
      if (constraints.min !== undefined && value < constraints.min) {
        return { ok: false, error: `Nilai minimum ${constraints.min}.` };
      }
      if (constraints.max !== undefined && value > constraints.max) {
        return { ok: false, error: `Nilai maksimum ${constraints.max}.` };
      }
      return { ok: true, value };
    }

    case 'number': {
      if (raw.trim() === '')
        return { ok: false, error: 'Nilai angka wajib diisi.' };
      const value = Number(raw);
      if (!Number.isFinite(value))
        return { ok: false, error: 'Nilai harus berupa angka finite.' };
      if (constraints.min !== undefined && value < constraints.min) {
        return { ok: false, error: `Nilai minimum ${constraints.min}.` };
      }
      if (constraints.max !== undefined && value > constraints.max) {
        return { ok: false, error: `Nilai maksimum ${constraints.max}.` };
      }
      if (constraints.precision !== undefined) {
        const factor = 10 ** constraints.precision;
        const rounded = Math.round(value * factor) / factor;
        if (Math.abs(value - rounded) > Number.EPSILON) {
          return {
            ok: false,
            error: `Maksimal ${constraints.precision} digit desimal.`,
          };
        }
      }
      return { ok: true, value };
    }

    case 'string':
      return { ok: true, value: raw };

    case 'enum': {
      const values = constraints.enumValues ?? [];
      const match = values.find((entry) => String(entry) === raw);
      if (match === undefined)
        return { ok: false, error: 'Nilai tidak termasuk enum capability.' };
      return { ok: true, value: match };
    }

    case 'object': {
      try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { ok: false, error: 'Nilai object harus berupa JSON object.' };
        }
        return { ok: true, value: value as Record<string, unknown> };
      } catch {
        return { ok: false, error: 'JSON object tidak valid.' };
      }
    }

    default:
      return {
        ok: false,
        error: `dataType capability tidak didukung: ${dataType || 'kosong'}.`,
      };
  }
}

export function capabilityNumberInputProps(
  capability: CapabilityValueContract,
): {
  min?: number;
  max?: number;
  step?: number | 'any';
} {
  const dataType = String(capability.dataType ?? '').toLowerCase();
  const constraints = readCapabilityConstraints(capability.constraints);
  if (dataType === 'integer') {
    return { min: constraints.min, max: constraints.max, step: 1 };
  }
  if (dataType === 'number') {
    return {
      min: constraints.min,
      max: constraints.max,
      step:
        constraints.precision === undefined
          ? 'any'
          : 1 / 10 ** constraints.precision,
    };
  }
  return {};
}
