import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_CODES } from './error-code';
import { GlobalExceptionFilter } from './global-exception.filter';

function createHost(requestId = 'request-123', url = '/devices?limit=10') {
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ send });
  const header = jest.fn();
  const request = {
    id: requestId,
    url,
  } as FastifyRequest;
  const reply = {
    header,
    status,
  } as unknown as FastifyReply;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as ArgumentsHost;

  return { host, header, status, send };
}

describe('Global Exception Filter', () => {
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes HttpException responses and preserves request context', () => {
    const filter = new GlobalExceptionFilter();
    const { host, header, status, send } = createHost();

    filter.catch(new BadRequestException('Invalid device request'), host);

    expect(header).toHaveBeenCalledWith('x-request-id', 'request-123');
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        requestId: 'request-123',
        path: '/devices',
        error: {
          code: ERROR_CODES.BadRequest,
          message: 'Invalid device request',
        },
      }),
    );
  });

  it('does not expose unexpected exception messages', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, send } = createHost('request-500', '/internal');

    filter.catch(new Error('database password leaked'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const envelope = send.mock.calls[0][0];
    expect(envelope.error).toEqual({
      code: ERROR_CODES.InternalError,
      message: 'Internal server error',
    });
    expect(JSON.stringify(envelope)).not.toContain('database password leaked');
    expect(JSON.stringify(loggerErrorSpy.mock.calls[0][0])).not.toContain(
      'database password leaked',
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.error.unhandled',
        error: { type: 'Error' },
      }),
    );
  });

  it('preserves only sanitized validation details', () => {
    const filter = new GlobalExceptionFilter();
    const { host, send } = createHost();

    filter.catch(
      new BadRequestException({
        code: ERROR_CODES.ValidationFailed,
        message: 'Request validation failed',
        details: [
          {
            field: 'name',
            messages: ['name should not be empty'],
            value: 'secret',
          },
          {
            field: 123,
            messages: ['invalid'],
          },
        ],
      }),
      host,
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: ERROR_CODES.ValidationFailed,
          message: 'Request validation failed',
          details: [
            {
              field: 'name',
              messages: ['name should not be empty'],
            },
          ],
        },
      }),
    );
    expect(JSON.stringify(send.mock.calls[0][0])).not.toContain('secret');
  });
});
