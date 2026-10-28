import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  limitWith,
  type LimitCheck,
  type LimitResult,
} from './shared-rate-limit.js';

const NOW = new Date('2026-01-01T10:00:00.000Z');

// The seconds left are computed from the clock: a frozen clock makes them exact
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.restoreAllMocks(); // the real Logger comes back
  vi.useRealTimers();
});

const answer = (overrides: Partial<LimitResult> = {}): LimitResult => ({
  success: true,
  limit: 10,
  remaining: 9,
  reset: NOW.getTime() + 30_000, // 30 seconds from now
  ...overrides,
});

// Runs the middleware with a fake request and response, and collects what it did.
// `request` is an object (not a bare ip) on purpose: a default parameter value also replaces
// an explicit `undefined`, so the "no ip" test would silently run with the default ip
async function run(
  check: LimitCheck,
  request: { ip?: string } = { ip: '1.2.3.4' },
) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();

  await limitWith('login', check)(request as never, res as never, next);
  return { res, headers, next };
}

describe('limitWith', () => {
  it('lets a request under the limit through and reports the numbers', async () => {
    const { res, headers, next } = await run(async () => answer());

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(headers).toEqual({
      'RateLimit-Limit': '10',
      'RateLimit-Remaining': '9',
      'RateLimit-Reset': '30',
    });
  });

  it('counts per route AND per ip', async () => {
    const check = vi.fn(async () => answer());

    // await run(check, '9.9.9.9');
    await run(check, { ip: '9.9.9.9' });
    // await run(check, {});

    expect(check).toHaveBeenCalledWith('login:9.9.9.9');
  });

  it('uses a shared key when the ip is unknown', async () => {
    const check = vi.fn(async () => answer());

    await run(check, {});

    expect(check).toHaveBeenCalledWith('login:unknown');
  });

  it('answers 429 with the seconds to wait, and does not call the next handler', async () => {
    const { res, headers, next } = await run(async () =>
      answer({ success: false, remaining: 0, reset: NOW.getTime() + 42_000 }),
    );

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Too many requests, please try again later',
    });
    expect(headers['Retry-After']).toBe('42');
    expect(headers['RateLimit-Remaining']).toBe('0');
    expect(next).not.toHaveBeenCalled();
  });

  it('never tells the client to wait less than one second', async () => {
    const { headers } = await run(async () =>
      answer({ success: false, remaining: 0, reset: NOW.getTime() - 5_000 }),
    );

    expect(headers['Retry-After']).toBe('1');
  });

  it('lets the request through (and logs it) when the counting service fails', async () => {
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const { res, next } = await run(async () => {
      throw new Error('Upstash is down');
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it('reports nothing when the service gave no real answer (a limit of 0)', async () => {
    const { res, next } = await run(async () =>
      answer({ limit: 0, remaining: 0, reset: 0 }),
    );

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
