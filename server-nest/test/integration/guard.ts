// The integration tests DELETE every row of the database they run on. This guard is the reason they
// can never be pointed at the real one: only a database on this machine whose name says "test"
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertSafeTestDatabase(testUrl: string | undefined): string {
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Point it at a throwaway database on this machine, for example postgresql://postgres:postgres@localhost:5433/ecommerce_test',
    );
  }

  let url: URL;
  try {
    url = new URL(testUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection address');
  }

  // Only the host and the name are printed: the address holds a password
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      'TEST_DATABASE_URL must be a PostgreSQL address (postgresql://...)',
    );
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run: the test database host is "${url.hostname}", not this machine. The tests delete every row`,
    );
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run: the database "${name}" does not have "test" in its name. It may be a database you use`,
    );
  }

  return testUrl;
}
