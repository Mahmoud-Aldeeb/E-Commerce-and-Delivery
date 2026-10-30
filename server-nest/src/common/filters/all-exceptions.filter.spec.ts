import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

// The real SDK never starts in a test: these two are the only parts the filter uses
vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  // An unexpected error is also written to the log: keep the test output clean
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllMocks(); // forgets the calls of the Sentry fakes between tests
  vi.restoreAllMocks(); // the real Logger comes back
  vi.unstubAllEnvs();
});

// A fake request context: the filter only reads the response and the request line
function makeHost(headersSent = false) {
  const res = {
    headersSent,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = { method: 'GET', url: '/api/x' };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  };
  return { host: host as never, res };
}

describe('errors thrown on purpose (HttpException)', () => {
  it('passes the answer through and does NOT report a 4xx', async () => {
    const { host, res } = makeHost();

    await new AllExceptionsFilter().catch(
      new BadRequestException('Enter a valid phone number'),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Enter a valid phone number',
        statusCode: 400,
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not report a 404 either', async () => {
    const { host, res } = makeHost();

    await new AllExceptionsFilter().catch(
      new NotFoundException('Order not found'),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('wraps a plain text message in the usual shape', async () => {
    const { host, res } = makeHost();

    await new AllExceptionsFilter().catch(
      new HttpException('Plain text', 418),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 418,
      message: 'Plain text',
    });
  });

  it('reports a 5xx, and waits for Sentry BEFORE it answers', async () => {
    const { host, res } = makeHost();
    const exception = new InternalServerErrorException('Image upload failed');

    await new AllExceptionsFilter().catch(exception, host);

    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
    // On a serverless host the process can freeze after the answer: the event must be sent first
    const flushed = vi.mocked(Sentry.flush).mock.invocationCallOrder[0];
    const answered = res.status.mock.invocationCallOrder[0];
    expect(flushed).toBeLessThan(answered);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('known database errors', () => {
  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('database error', {
      code,
      clientVersion: 'test',
    });

  it.each([
    ['P2002', 409, 'A record with this value already exists'],
    ['P2025', 404, 'Record not found'],
    ['P2003', 400, 'A related record does not exist'],
  ])(
    'turns %s into %i and does not report it',
    async (code, status, message) => {
      const { host, res } = makeHost();

      await new AllExceptionsFilter().catch(prismaError(code), host);

      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith({ statusCode: status, message });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    },
  );

  it('treats a database error with no mapping as a bug: reported, answered with 500', async () => {
    const { host, res } = makeHost();
    const exception = prismaError('P2999');

    await new AllExceptionsFilter().catch(exception, host);

    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('unexpected errors', () => {
  it('reports it and hides the message in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { host, res } = makeHost();
    const exception = new Error('the database password is wrong');

    await new AllExceptionsFilter().catch(exception, host);

    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('shows the message outside production, to help the developer', async () => {
    const { host, res } = makeHost();

    await new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: 'boom' });
  });

  it('still answers when reporting to Sentry fails', async () => {
    vi.mocked(Sentry.flush).mockRejectedValueOnce(new Error('network is down'));
    const { host, res } = makeHost();

    await new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('an answer that was already sent', () => {
  it('does nothing', async () => {
    const { host, res } = makeHost(true);

    await new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(res.status).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
