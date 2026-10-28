import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// What a rate-limit service answers for one key
export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp in milliseconds when the window resets */
  reset: number;
}

// Counts one request for `key` and says whether it is allowed
export type LimitCheck = (key: string) => Promise<LimitResult>;

const logger = new Logger('RateLimit');

// An Express middleware that limits every client ip with the given check.
// `name` keeps the counters of different routes apart (login and register never share a count)
export function limitWith(name: string, check: LimitCheck) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let result: LimitResult;
    try {
      result = await check(`${name}:${req.ip ?? 'unknown'}`);
    } catch (error) {
      // The counting service is down: let the request through and log it.
      // Blocking every user because a helper service is down would be worse than skipping a limit
      logger.error(
        `Rate limit check failed for "${name}": ${(error as Error).message}`,
      );
      next();
      return;
    }

    const secondsLeft = Math.max(
      1,
      Math.ceil((result.reset - Date.now()) / 1000),
    );

    // A limit of 0 means the service gave no real answer: there is nothing to report
    if (result.limit > 0) {
      res.setHeader('RateLimit-Limit', String(result.limit));
      res.setHeader(
        'RateLimit-Remaining',
        String(Math.max(0, result.remaining)),
      );
      res.setHeader('RateLimit-Reset', String(secondsLeft));
    }

    if (!result.success) {
      res.setHeader('Retry-After', String(secondsLeft));
      res
        .status(429)
        .json({
          statusCode: 429,
          message: 'Too many requests, please try again later',
        });
      return;
    }

    next();
  };
}
