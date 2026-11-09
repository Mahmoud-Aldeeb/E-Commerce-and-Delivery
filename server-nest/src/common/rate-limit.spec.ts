import { describe, expect, it, vi } from 'vitest';
import { onlyPost } from './rate-limit.js';

// Runs the middleware for a request of this method, with a fake limiter
const run = (method: string) => {
  const limiter = vi.fn();
  const next = vi.fn();
  onlyPost(limiter as never)({ method } as never, {} as never, next);
  return { limiter, next };
};

describe('onlyPost', () => {
  it('sends a POST through the limiter, which decides whether it goes on', () => {
    const { limiter, next } = run('POST');

    expect(limiter).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'DELETE'])(
    'lets a %s go on without being counted',
    (method) => {
      const { limiter, next } = run(method);

      expect(limiter).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    },
  );
});
