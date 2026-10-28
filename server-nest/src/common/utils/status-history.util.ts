import { Prisma } from '../../generated/prisma/client.js';

// Returns a NEW history array with one more entry (never mutates the stored one)
export function appendStatusHistory(
  current: Prisma.JsonValue,
  status: string,
  note: string,
): Prisma.InputJsonValue[] {
  const history = Array.isArray(current)
    ? (current as Prisma.InputJsonValue[])
    : [];
  return [...history, { status, note, timestamp: new Date().toISOString() }];
}
