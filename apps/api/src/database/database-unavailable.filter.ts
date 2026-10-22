import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { isConnectionLost } from './prisma-errors';

// A dropped database connection (restart, failover, network blip) is
// temporary. Answer 503 with Retry-After instead of a generic 500, so
// clients know retrying is the right move. Holds are safe to retry with the
// same Idempotency-Key.
@Catch()
export class DatabaseUnavailableFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseUnavailableFilter.name);

  override catch(exception: unknown, host: ArgumentsHost) {
    if (!isConnectionLost(exception)) return super.catch(exception, host);

    this.logger.warn(`Database connection lost while handling a request: ${String(exception)}`);
    const res = host.switchToHttp().getResponse<Response>();
    res
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .set('Retry-After', '1')
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'We lost our connection to the database for a moment. Please try again.',
      });
  }
}
