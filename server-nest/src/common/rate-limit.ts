import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { rateLimit } from 'express-rate-limit';
import { limitWith, type LimitCheck } from './shared-rate-limit.js';

const MINUTE = 60_000;
const logger = new Logger('RateLimit');

// In memory: each server instance counts on its own. Cheap, but only a partial protection on
// Vercel (instances do not share their counts). Used for the general limit
const memoryLimiter = (
  limit: number,
  windowMs: number,
  skip?: (req: { path: string }) => boolean,
) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true, // sends the RateLimit-* headers
    legacyHeaders: false,
    skip,
    message: {
      statusCode: 429,
      message: 'Too many requests, please try again later',
    },
  });

// The connection to Upstash. null when the variables are missing (development)
function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Builds the limiter of one sensitive route: shared through Redis when it is configured,
// in memory (like before) when it is not
function createStrictLimiter(redis: Redis | null) {
  return (name: string, limit: number, windowSeconds: number) => {
    if (!redis) return memoryLimiter(limit, windowSeconds * 1000);

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        limit,
        `${windowSeconds} s` as `${number} s`,
      ),
      // If Upstash does not answer within a second, the request is let through
      timeout: 1000,
    });

    const check: LimitCheck = async (key) => {
      const {
        success,
        limit: max,
        remaining,
        reset,
      } = await ratelimit.limit(key);
      return { success, limit: max, remaining, reset };
    };
    return limitWith(name, check);
  };
}

export function applyRateLimits(app: NestExpressApplication) {
  const redis = createRedis();
  if (redis) {
    logger.log('Strict limits are shared through Upstash Redis');
  } else if (process.env.NODE_ENV === 'production') {
    logger.warn(
      'UPSTASH_REDIS_REST_URL / TOKEN are not set: strict limits stay in memory, per instance',
    );
  } else {
    logger.log('Upstash is not configured: all limits stay in memory');
  }

  const strict = createStrictLimiter(redis);

  // Strict limits on the sensitive routes (the name keeps each route's counter apart)
  app.use('/api/auth/register', strict('register', 5, 60));
  app.use('/api/auth/login', strict('login', 10, 60));
  app.use('/api/auth/google', strict('google', 10, 60));
  app.use('/api/auth/forgot-password', strict('forgot-password', 5, 15 * 60)); // stops inbox spam
  app.use('/api/auth/reset-password', strict('reset-password', 10, 15 * 60));
  app.use('/api/auth/set-password', strict('set-password', 5, 15 * 60));
  app.use('/api/delivery/login', strict('delivery-login', 10, 60));
  app.use(
    '/api/delivery/my-deliveries/:id/complete',
    strict('delivery-complete', 5, 5 * 60),
  ); // OTP attempts
  app.use('/api/upload', strict('upload', 10, 60));
  app.use('/api/orders/:id/cancel', strict('order-cancel', 10, 60));

  // General limit for everything else. Stripe and Inngest are server-to-server calls,
  // so they are skipped (their own signatures protect them).
  app.use(
    '/api',
    memoryLimiter(
      100,
      MINUTE,
      (req) =>
        req.path.startsWith('/stripe') || req.path.startsWith('/inngest'),
    ),
  );
}
