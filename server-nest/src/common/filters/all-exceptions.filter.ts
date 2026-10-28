import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

const isProduction = () => process.env.NODE_ENV === 'production';

// Known Prisma error codes that have a meaningful HTTP status
function mapPrismaError(error: Prisma.PrismaClientKnownRequestError) {
  switch (error.code) {
    case 'P2002': // unique constraint (e.g. duplicate email)
      return {
        status: HttpStatus.CONFLICT,
        message: 'A record with this value already exists',
      };
    case 'P2025': // record not found for update/delete
      return { status: HttpStatus.NOT_FOUND, message: 'Record not found' };
    case 'P2003': // foreign key constraint
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'A related record does not exist',
      };
    default:
      return null;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (res.headersSent) return;

    // 1) Errors thrown on purpose (NotFoundException, ForbiddenException, validation...)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      return res
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
    }

    // 2) Known database errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        return res
          .status(mapped.status)
          .json({ statusCode: mapped.status, message: mapped.message });
      }
    }

    // 3) Anything else is a bug: log everything, show little
    this.logger.error(
      `${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const message =
      !isProduction() && exception instanceof Error
        ? exception.message
        : 'Internal server error';

    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message });
  }
}
