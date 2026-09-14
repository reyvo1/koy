import { ERROR_CODES, errorCodeForStatus } from './error-code';

describe('Error Code', () => {
  it('maps stable HTTP status codes', () => {
    expect(errorCodeForStatus(400)).toBe(ERROR_CODES.BadRequest);
    expect(errorCodeForStatus(401)).toBe(ERROR_CODES.Unauthorized);
    expect(errorCodeForStatus(403)).toBe(ERROR_CODES.Forbidden);
    expect(errorCodeForStatus(404)).toBe(ERROR_CODES.NotFound);
    expect(errorCodeForStatus(409)).toBe(ERROR_CODES.Conflict);
    expect(errorCodeForStatus(422)).toBe(ERROR_CODES.UnprocessableEntity);
    expect(errorCodeForStatus(429)).toBe(ERROR_CODES.TooManyRequests);
    expect(errorCodeForStatus(500)).toBe(ERROR_CODES.InternalError);
    expect(errorCodeForStatus(503)).toBe(ERROR_CODES.ServiceUnavailable);
  });

  it('uses a stable fallback for uncommon HTTP statuses', () => {
    expect(errorCodeForStatus(418)).toBe(ERROR_CODES.HttpError);
  });

  it('keeps all generic and domain codes unique', () => {
    const codes = Object.values(ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);
  });
});
