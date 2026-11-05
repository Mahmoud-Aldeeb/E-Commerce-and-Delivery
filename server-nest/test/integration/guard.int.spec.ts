import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabase } from './guard.js';

const messageOf = (call: () => unknown): string | undefined => {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
};

describe('assertSafeTestDatabase', () => {
  it.each([
    ['postgresql://postgres:postgres@localhost:5432/ecommerce_test'],
    ['postgres://postgres:postgres@127.0.0.1:5433/shop_TEST'],
    ['postgresql://postgres:postgres@[::1]:5432/test'],
  ])('accepts the local database %s', (url) => {
    expect(assertSafeTestDatabase(url)).toBe(url);
  });

  it('refuses a database that is not on this machine, even when its name says test', () => {
    const message = messageOf(() =>
      assertSafeTestDatabase(
        'postgresql://user:secretpass@ep-abc-pooler.us-east-2.aws.neon.tech/neondb_test',
      ),
    );

    expect(message).toContain('not this machine');
  });

  it('refuses a local database whose name does not say test (it may be the one used for development)', () => {
    const message = messageOf(() =>
      assertSafeTestDatabase(
        'postgresql://postgres:pw@localhost:5432/ecommerce',
      ),
    );

    expect(message).toContain('"test"');
  });

  it.each([
    [undefined, 'not set'],
    ['', 'not set'],
    ['not a url', 'not a valid'],
    ['mysql://root:pw@localhost:3306/test', 'PostgreSQL address'],
    ['http://localhost/test', 'PostgreSQL address'],
  ])('refuses %j', (value, expected) => {
    expect(messageOf(() => assertSafeTestDatabase(value))).toContain(expected);
  });

  it('never prints the password', () => {
    const message = messageOf(() =>
      assertSafeTestDatabase(
        'postgresql://postgres:secretpass@ep-abc.neon.tech/test',
      ),
    );

    expect(message).toBeDefined();
    expect(message).not.toContain('secretpass');
  });
});
