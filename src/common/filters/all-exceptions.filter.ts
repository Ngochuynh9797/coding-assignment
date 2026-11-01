import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppException } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

// body-parser throws http-errors (e.g. 413) that Nest passes through without wrapping in HttpException.
function clientErrorStatus(exception: unknown): number | undefined {
  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : exception instanceof Error && (exception as { expose?: unknown }).expose === true
        ? (exception as { status?: unknown }).status
        : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const error = this.toAppException(exception);
    // req.log, not an injected PinoLogger: errors thrown before Nest's module middleware (body parser)
    // run outside nestjs-pino's request context, but req.log always carries the reqId.
    const log = req.log.child({ context: AllExceptionsFilter.name });

    if (error.httpStatus >= 500) {
      log.error({ err: exception }, 'Unhandled exception');
    } else {
      log.warn(
        { code: error.code, status: error.httpStatus, details: error.details },
        error.message,
      );
    }

    res.status(error.httpStatus).json({
      error: { code: error.code, message: error.message, details: error.details },
      // resolveRequestId (logging module) always assigns a string.
      requestId: req.id as string,
    });
  }

  private toAppException(exception: unknown): AppException {
    if (exception instanceof AppException) {
      return exception;
    }
    if (exception instanceof NotFoundException) {
      return new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Route not found');
    }
    if (exception instanceof BadRequestException) {
      // The parser's own message (e.g. "Unexpected token } in JSON at position 10") is not echoed.
      return new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Malformed request: the body or URL could not be parsed',
      );
    }
    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: unknown }).code;
      if (code === PG_UNIQUE_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION) {
        return new AppException(
          ErrorCode.CONFLICT,
          HttpStatus.CONFLICT,
          'The request conflicts with the current state of the data',
        );
      }
    }
    const status = clientErrorStatus(exception);
    if (status !== undefined) {
      return new AppException(
        ErrorCode.VALIDATION_ERROR,
        status,
        STATUS_CODES[status] ?? 'Bad Request',
      );
    }
    return new AppException(
      ErrorCode.INTERNAL_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
    );
  }
}
