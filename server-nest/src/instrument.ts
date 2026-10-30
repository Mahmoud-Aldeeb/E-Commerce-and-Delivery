// Loads .env first: this file runs BEFORE Nest's ConfigModule, which would load it too late
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Without a DSN the SDK does nothing, so development works with no Sentry account
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV ?? 'development',
  // Errors only: no performance tracing (no tracesSampleRate)

  // Whatever users typed (passwords, card data) and their tokens never leave the server
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) {
        for (const name of Object.keys(event.request.headers)) {
          if (
            ['authorization', 'cookie', 'stripe-signature'].includes(
              name.toLowerCase(),
            )
          ) {
            delete event.request.headers[name];
          }
        }
      }
    }
    return event;
  },
});
