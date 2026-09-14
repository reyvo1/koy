import { toStructuredLogError } from './log-error';

describe('toStructuredLogError', () => {
  it('serializes an Error with type, message, and stack', () => {
    const error = new Error('database unavailable');

    expect(toStructuredLogError(error)).toEqual({
      type: 'Error',
      message: 'database unavailable',
      stack: error.stack,
    });
  });

  it('includes a stable error code when available', () => {
    const error = Object.assign(new Error('unique constraint failed'), {
      code: 'P2002',
    });

    expect(toStructuredLogError(error)).toEqual({
      type: 'Error',
      message: 'unique constraint failed',
      stack: error.stack,
      code: 'P2002',
    });
  });

  it('serializes a non-empty string error without throwing', () => {
    expect(toStructuredLogError('broker unavailable')).toEqual({
      type: 'UnknownError',
      message: 'broker unavailable',
    });
  });

  it('uses a safe fallback for unknown error values', () => {
    expect(toStructuredLogError({ reason: 'unknown' })).toEqual({
      type: 'UnknownError',
      message: 'Unknown error',
    });
  });
});
