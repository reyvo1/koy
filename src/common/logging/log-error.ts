export interface StructuredLogError {
  type: string;
  message: string;
  stack?: string;
  code?: string;
}

export function toStructuredLogError(error: unknown): StructuredLogError {
  if (error instanceof Error) {
    const structuredError: StructuredLogError = {
      type: error.name || 'Error',
      message: error.message || 'Unknown error',
    };

    if (error.stack) {
      structuredError.stack = error.stack;
    }

    const code = (error as Error & { code?: unknown }).code;

    if (typeof code === 'string' || typeof code === 'number') {
      structuredError.code = String(code);
    }

    return structuredError;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return {
      type: 'UnknownError',
      message: error,
    };
  }

  return {
    type: 'UnknownError',
    message: 'Unknown error',
  };
}
