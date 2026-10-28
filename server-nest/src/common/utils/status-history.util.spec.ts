import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendStatusHistory } from './status-history.util.js';

describe('appendStatusHistory', () => {
  // The function writes the current time: a frozen clock makes the result predictable
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds one entry with the status, the note and the time', () => {
    expect(
      appendStatusHistory([], 'Cancelled', 'Cancelled by the store'),
    ).toEqual([
      {
        status: 'Cancelled',
        note: 'Cancelled by the store',
        timestamp: '2026-01-01T10:00:00.000Z',
      },
    ]);
  });

  it('keeps the old entries and puts the new one last', () => {
    const old = {
      status: 'Placed',
      note: 'Order placed',
      timestamp: 'earlier',
    };

    const next = appendStatusHistory([old], 'Assigned', 'Assigned to Ali');

    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(old);
    expect(next[1]).toMatchObject({
      status: 'Assigned',
      note: 'Assigned to Ali',
    });
  });

  it('returns a NEW array and leaves the stored one untouched', () => {
    const stored = [{ status: 'Placed', note: 'x', timestamp: 't' }];

    const next = appendStatusHistory(stored, 'Packed', 'y');

    expect(next).not.toBe(stored);
    expect(stored).toHaveLength(1);
  });

  it('starts a new history when the stored value is not an array', () => {
    expect(appendStatusHistory(null, 'Placed', 'n')).toHaveLength(1);
    expect(appendStatusHistory({ oops: true }, 'Placed', 'n')).toHaveLength(1);
  });
});
