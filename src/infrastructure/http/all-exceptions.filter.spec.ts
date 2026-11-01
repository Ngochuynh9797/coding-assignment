import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AppException } from '@shared/errors/app-exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function setup() {
  const logger = { warn: jest.fn(), error: jest.fn() };
  const res = {
    status: jest.fn<unknown, [number]>().mockReturnThis(),
    json: jest.fn<void, [unknown]>(),
  };
  const req = { id: 'req-1', method: 'GET', url: '/api/v1/x', log: { child: () => logger } };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter();

  const handle = (exception: unknown) => {
    filter.catch(exception, host);
    const status = res.status.mock.calls[0]?.[0];
    const body = res.json.mock.calls[0]?.[0] as {
      error: { code: string; message: string; details: unknown[] };
      requestId: string;
    };
    return { status, body };
  };

  return { handle, logger };
}

function pgError(code: string, message: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO t VALUES ($1)',
    ['secret'],
    Object.assign(new Error(message), { code }),
  );
}

describe('AllExceptionsFilter', () => {
  it('keeps an AppException as is and adds the request id', () => {
    const { handle } = setup();
    const details = [{ field: 'entries[2].exerciseName', issue: "Unknown exercise 'Bech Press'" }];

    const { status, body } = handle(
      new AppException(
        'UNKNOWN_EXERCISE',
        400,
        'One or more exercises are not in the catalog',
        details,
      ),
    );

    expect(status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'UNKNOWN_EXERCISE',
        message: 'One or more exercises are not in the catalog',
        details,
      },
      requestId: 'req-1',
    });
  });

  it('maps a route NotFoundException to 404 NOT_FOUND', () => {
    const { handle } = setup();

    const { status, body } = handle(new NotFoundException('Cannot GET /api/v1/x'));

    expect(status).toBe(404);
    expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Route not found', details: [] });
  });

  it('maps other BadRequestExceptions (e.g. malformed JSON) to 400 VALIDATION_ERROR', () => {
    const { handle } = setup();

    const { status, body } = handle(new BadRequestException('Unexpected end of JSON input'));

    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('Unexpected end of JSON');
  });

  it('keeps the status of other client HttpExceptions', () => {
    const { handle } = setup();

    const { status, body } = handle(new HttpException('Too many', HttpStatus.TOO_MANY_REQUESTS));

    expect(status).toBe(429);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the status of body-parser errors such as an oversized body', () => {
    const { handle } = setup();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });

    const { status, body } = handle(tooLarge);

    expect(status).toBe(413);
    expect(body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Payload Too Large',
      details: [],
    });
  });

  it.each(['23505', '23503'])(
    'maps Postgres error %s to 409 CONFLICT without leaking the DB message',
    (code) => {
      const { handle } = setup();

      const { status, body } = handle(
        pgError(code, 'duplicate key value violates unique constraint "uq"'),
      );

      expect(status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('duplicate key');
      expect(serialized).not.toContain('INSERT');
      expect(serialized).not.toContain('secret');
    },
  );

  it('maps other Postgres errors to 500 INTERNAL_ERROR', () => {
    const { handle } = setup();

    const { status, body } = handle(pgError('23514', 'new row violates check constraint'));

    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('maps an unexpected Error to a generic 500 without internals', () => {
    const { handle } = setup();

    const { status, body } = handle(new Error('connection to 10.0.0.5 refused'));

    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] },
      requestId: 'req-1',
    });
  });

  it('maps a server-side HttpException to 500 INTERNAL_ERROR', () => {
    const { handle } = setup();

    const { status, body } = handle(new HttpException('upstream detail', HttpStatus.BAD_GATEWAY));

    expect(status).toBe(500);
    expect(body.error.message).toBe('Internal server error');
  });

  it('logs 5xx at error level with the original error (and its stack)', () => {
    const { handle, logger } = setup();
    const error = new Error('boom');

    handle(error);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error }),
      expect.any(String),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs 4xx at warn level', () => {
    const { handle, logger } = setup();

    handle(new AppException('VALIDATION_ERROR', 400, 'Request validation failed'));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
