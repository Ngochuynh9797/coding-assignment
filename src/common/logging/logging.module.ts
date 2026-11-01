import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { type HttpLogger, pinoHttp } from 'pino-http';
import { APP_CONFIG } from '@config/config.module';
import type { AppConfig } from '@config/env.validation';

export const HTTP_LOGGER = Symbol('HTTP_LOGGER');

// Printable ASCII without spaces: a client-supplied id must not inject newlines or fake fields into logs.
const CLIENT_REQUEST_ID = /^[\x21-\x7E]{1,128}$/;

export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && CLIENT_REQUEST_ID.test(header) ? header : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

export function createHttpLogger(config: AppConfig): HttpLogger {
  return pinoHttp({
    level: config.LOG_LEVEL,
    genReqId: resolveRequestId,
    quietReqLogger: true,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    // pino-pretty is a devDependency and is pruned from the production image.
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  });
}

@Module({
  providers: [{ provide: HTTP_LOGGER, inject: [APP_CONFIG], useFactory: createHttpLogger }],
  exports: [HTTP_LOGGER],
})
class HttpLoggerModule {}

// main.ts mounts HTTP_LOGGER as the first Express middleware: Nest registers its body parser before
// module middleware, so a malformed or oversized body would otherwise fail before a request id exists.
@Module({
  imports: [
    HttpLoggerModule,
    LoggerModule.forRootAsync({
      imports: [HttpLoggerModule],
      inject: [HTTP_LOGGER],
      useFactory: (httpLogger: HttpLogger) => ({
        pinoHttp: { logger: httpLogger.logger },
        useExisting: true,
      }),
    }),
  ],
  exports: [HttpLoggerModule],
})
export class LoggingModule {}
