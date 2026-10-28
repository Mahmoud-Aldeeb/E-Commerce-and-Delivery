import { rateLimit } from 'express-rate-limit';
import type { NestExpressApplication } from '@nestjs/platform-express';

const MINUTE = 60_000;

// Builds one limiter: at most `limit` requests per `windowMs` for each client ip
const limiter = (
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

export function applyRateLimits(app: NestExpressApplication) {
  // Strict limits on the sensitive routes
  app.use('/api/auth/register', limiter(5, MINUTE));
  app.use('/api/auth/login', limiter(10, MINUTE));
  app.use('/api/delivery/login', limiter(10, MINUTE));
  app.use('/api/delivery/my-deliveries/:id/complete', limiter(5, 5 * MINUTE)); // OTP attempts
  app.use('/api/upload', limiter(10, MINUTE));
  app.use('/api/orders/:id/cancel', limiter(10, MINUTE));
  app.use('/api/auth/google', limiter(10, MINUTE));
  app.use('/api/auth/forgot-password', limiter(5, 15 * MINUTE)); // stops inbox spam
  app.use('/api/auth/reset-password', limiter(10, 15 * MINUTE));
  app.use('/api/auth/set-password', limiter(5, 15 * MINUTE));
  // General limit for everything else. Stripe and Inngest are server-to-server calls,
  // so they are skipped (their own signatures protect them).
  app.use(
    '/api',
    limiter(
      100,
      MINUTE,
      (req) =>
        req.path.startsWith('/stripe') || req.path.startsWith('/inngest'),
    ),
  );
}
