import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AppService } from './app.service.js';

// The service imports it only so Nest can inject it: the tests hand it a fake instead
vi.mock('./prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

afterEach(() => {
  vi.restoreAllMocks(); // the real Logger comes back
  vi.useRealTimers();
});

// `$queryRaw` is what the service asks the database with
function setup(queryRaw: ReturnType<typeof vi.fn>) {
  const errorLog = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const service = new AppService({ $queryRaw: queryRaw } as never);
  return { service, errorLog };
}

describe('checkHealth', () => {
  it('says the database is up when it answers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const { service, errorLog } = setup(queryRaw);

    await expect(service.checkHealth()).resolves.toEqual({ database: 'up' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('asks the lightest possible question', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const { service } = setup(queryRaw);

    await service.checkHealth();

    // A tagged template: the first argument is the list of text pieces
    expect(Array.from(queryRaw.mock.calls[0][0])).toEqual(['SELECT 1']);
  });

  it('says the database is down (and logs why) when the query fails', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('connection refused'));
    const { service, errorLog } = setup(queryRaw);

    await expect(service.checkHealth()).resolves.toEqual({ database: 'down' });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it('says the database is down when it does not answer in time', async () => {
    vi.useFakeTimers();
    const queryRaw = vi.fn(() => new Promise(() => undefined)); // never answers
    const { service } = setup(queryRaw);

    const result = service.checkHealth();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(result).resolves.toEqual({ database: 'down' });
  });
});

describe('getHello', () => {
  it('keeps the plain answer the hosting platform relies on', () => {
    const { service } = setup(vi.fn());

    expect(service.getHello()).toBe('Server is Live!');
  });
});
