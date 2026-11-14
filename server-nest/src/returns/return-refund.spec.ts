import { describe, expect, it } from 'vitest';
import {
  allowedRefundMethods,
  checkRefundDestination,
  normalizeMobile,
  resolveRefundMethod,
  splitReturnRefund,
} from './return-rules.js';

describe('allowedRefundMethods', () => {
  it('sends a card payment back to the card, and nowhere else', () => {
    expect(allowedRefundMethods('card')).toEqual(['ORIGINAL_PAYMENT']);
  });

  it('sends an order the wallet paid in full back to the wallet', () => {
    expect(allowedRefundMethods('wallet')).toEqual(['STORE_WALLET']);
  });

  it.each(['cash', 'cod'])(
    'lets a %s order choose: the wallet first, then a mobile wallet or InstaPay',
    (method) => {
      expect(allowedRefundMethods(method)).toEqual([
        'STORE_WALLET',
        'MOBILE_WALLET',
        'INSTAPAY',
      ]);
    },
  );
});

describe('resolveRefundMethod', () => {
  it.each([
    ['card', 'ORIGINAL_PAYMENT'],
    ['wallet', 'STORE_WALLET'],
    ['cash', 'STORE_WALLET'],
  ])(
    'refunds a %s order to %s when the customer does not choose',
    (payment, expected) => {
      expect(resolveRefundMethod(payment, undefined)).toEqual({
        ok: true,
        method: expected,
      });
    },
  );

  it('accepts a method the order allows', () => {
    expect(resolveRefundMethod('cash', 'INSTAPAY')).toEqual({
      ok: true,
      method: 'INSTAPAY',
    });
  });

  it.each([
    ['card', 'STORE_WALLET', 'A card payment is refunded to the card'],
    [
      'wallet',
      'INSTAPAY',
      'An order paid from the wallet is refunded to the wallet',
    ],
    [
      'cash',
      'ORIGINAL_PAYMENT',
      'This refund method is not available for this order',
    ],
  ] as const)('refuses %s with %s', (payment, asked, message) => {
    expect(resolveRefundMethod(payment, asked)).toEqual({ ok: false, message });
  });
});

describe('normalizeMobile', () => {
  it.each([
    ['01012345678', '01012345678'],
    ['+201012345678', '01012345678'],
    ['00201012345678', '01012345678'],
    ['1012345678', '01012345678'],
    ['0101 234 5678', '01012345678'],
    ['011-1234-5678', '01112345678'],
    ['01512345678', '01512345678'],
  ])('turns %j into %j', (value, expected) => {
    expect(normalizeMobile(value)).toBe(expected);
  });

  it.each(['', '0101234567', '01312345678', 'abc', '010123456789'])(
    'refuses %j',
    (value) => {
      expect(normalizeMobile(value)).toBeNull();
    },
  );

  it('refuses nothing at all', () => {
    expect(normalizeMobile(null)).toBeNull();
    expect(normalizeMobile(undefined)).toBeNull();
  });
});

describe('checkRefundDestination', () => {
  it('keeps the mobile number of a mobile wallet in its clean form', () => {
    expect(
      checkRefundDestination('MOBILE_WALLET', ' +20 101 234 5678 '),
    ).toEqual({
      ok: true,
      details: '01012345678',
    });
  });

  it('refuses a mobile wallet without a real number, and says how it should look', () => {
    expect(checkRefundDestination('MOBILE_WALLET', 'hello')).toEqual({
      ok: false,
      message: 'Enter the mobile number of your wallet, like 01012345678',
    });
  });

  it('keeps an InstaPay address in lower case', () => {
    expect(checkRefundDestination('INSTAPAY', ' Mona.Ali@InstaPay ')).toEqual({
      ok: true,
      details: 'mona.ali@instapay',
    });
  });

  it('takes the mobile number linked to InstaPay too', () => {
    expect(checkRefundDestination('INSTAPAY', '010 1234 5678')).toEqual({
      ok: true,
      details: '01012345678',
    });
  });

  it.each(['', 'hello', 'a@', '@instapay', 'x@instapay'])(
    'refuses %j for InstaPay',
    (value) => {
      expect(checkRefundDestination('INSTAPAY', value)).toEqual({
        ok: false,
        message:
          'Enter your InstaPay address (like name@instapay) or the mobile number linked to it',
      });
    },
  );

  it.each(['ORIGINAL_PAYMENT', 'STORE_WALLET'] as const)(
    'keeps no details for %s',
    (method) => {
      expect(checkRefundDestination(method, '01012345678')).toEqual({
        ok: true,
        details: null,
      });
    },
  );
});

describe('splitReturnRefund', () => {
  it('sends everything to the wallet when the customer asks for the wallet', () => {
    expect(
      splitReturnRefund({
        refundAmount: 21.6,
        method: 'STORE_WALLET',
        walletPaidLeft: 0,
      }),
    ).toEqual({ toWallet: 21.6, external: 0 });
  });

  it('sends the part the wallet paid back to the wallet first, and the rest to the method', () => {
    expect(
      splitReturnRefund({
        refundAmount: 21.6,
        method: 'INSTAPAY',
        walletPaidLeft: 5,
      }),
    ).toEqual({ toWallet: 5, external: 16.6 });
  });

  it('sends it all to the wallet when the wallet paid more than the refund', () => {
    expect(
      splitReturnRefund({
        refundAmount: 3,
        method: 'ORIGINAL_PAYMENT',
        walletPaidLeft: 5,
      }),
    ).toEqual({ toWallet: 3, external: 0 });
  });

  it('sends nothing to the wallet when it paid nothing', () => {
    expect(
      splitReturnRefund({
        refundAmount: 21.6,
        method: 'ORIGINAL_PAYMENT',
        walletPaidLeft: 0,
      }),
    ).toEqual({ toWallet: 0, external: 21.6 });
  });

  it('counts in cents, so decimal noise never leaves a stray cent', () => {
    expect(
      splitReturnRefund({
        refundAmount: 0.1 + 0.2,
        method: 'INSTAPAY',
        walletPaidLeft: 0.1,
      }),
    ).toEqual({ toWallet: 0.1, external: 0.2 });
  });

  it('never goes below zero', () => {
    expect(
      splitReturnRefund({
        refundAmount: -1,
        method: 'INSTAPAY',
        walletPaidLeft: -4,
      }),
    ).toEqual({ toWallet: 0, external: 0 });
  });
});
