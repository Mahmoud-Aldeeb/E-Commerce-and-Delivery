import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../mail/mail.service.js', () => ({
  MailService: class MailService {},
}));

// A tiny stand-in for bcrypt: fast, and the "hash" shows what was hashed ("hashed:secret1")
vi.mock('bcrypt', () => ({
  default: {
    hash: async (plain: string) => `hashed:${plain}`,
    compare: async (plain: string, hash: string) => hash === `hashed:${plain}`,
  },
}));

// Every Google client the service creates gets its own spy, so no test calls Google
vi.mock('google-auth-library', () => ({
  OAuth2Client: class OAuth2Client {
    verifyIdToken = vi.fn();
  },
}));

afterEach(() => {
  vi.restoreAllMocks(); // the real Logger methods come back
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// A user as the database stores it. Each test changes only what it is about
const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Ali',
  email: 'ali@example.com',
  password: 'hashed:secret1',
  googleId: null,
  passwordResetToken: null,
  passwordResetExpires: null,
  tokenVersion: 0,
  phone: '',
  avatar: '',
  role: 'USER',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  addresses: [],
  ...overrides,
});

const googlePayload = (overrides: Record<string, unknown> = {}) => ({
  sub: 'g1',
  email: 'Ali@Example.com',
  email_verified: true,
  name: 'Ali Google',
  picture: 'https://pics.example/ali.png',
  ...overrides,
});

// None of these may ever reach the browser
function expectNoSecrets(user: object) {
  for (const key of [
    'password',
    'googleId',
    'passwordResetToken',
    'passwordResetExpires',
    'tokenVersion',
  ]) {
    expect(user).not.toHaveProperty(key);
  }
}

function setup(config: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: 'client-id',
    CLIENT_URL: 'https://shop.example/',
    ...config,
  };
  const fakeConfig = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing config ${key}`);
      return value;
    },
  };

  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue('jwt-token') };
  const mail = { sendEmail: vi.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    prisma as never,
    jwt as never,
    fakeConfig as never,
    mail as never,
  );
  // The spy that stands in for Google's verification (created inside the service)
  const verifyIdToken = (
    service as unknown as { googleClient: { verifyIdToken: Mock } }
  ).googleClient.verifyIdToken;

  return { service, prisma, jwt, mail, verifyIdToken };
}

describe('the setup of the service', () => {
  it('refuses to start without the Google client id', () => {
    expect(() => setup({ GOOGLE_CLIENT_ID: undefined })).toThrow(
      'Missing config GOOGLE_CLIENT_ID',
    );
  });

  it('refuses to start in production without CLIENT_URL (reset links are built from it)', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => setup({ CLIENT_URL: undefined })).toThrow(
      'CLIENT_URL is required in production',
    );
  });
});

describe('register', () => {
  it('lowercases the email, stores a hash (never the password) and returns a token', async () => {
    const { service, prisma, jwt } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: object }) =>
      makeUser({ ...data }),
    );

    const result = await service.register({
      name: 'Ali',
      email: 'Ali@Example.COM',
      password: 'secret1',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ali@example.com' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'Ali',
        email: 'ali@example.com',
        password: 'hashed:secret1',
      },
    });
    expect(jwt.sign).toHaveBeenCalledWith({ id: 'u1', v: 0 });
    expect(result.token).toBe('jwt-token');
    expect(result.user).toMatchObject({
      email: 'ali@example.com',
      hasPassword: true,
      hasGoogle: false,
    });
    expectNoSecrets(result.user);
  });

  it('refuses an email that is already registered', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const error = await failureOf(
      service.register({
        name: 'Ali',
        email: 'ali@example.com',
        password: 'secret1',
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'User already exists with this email',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('returns the user (with addresses, without secrets) and a token', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.login({
      email: 'Ali@Example.com',
      password: 'secret1',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ali@example.com' },
      include: { addresses: true },
    });
    expect(result.token).toBe('jwt-token');
    expect(result.user).toMatchObject({
      id: 'u1',
      isAdmin: false,
      hasPassword: true,
      hasGoogle: false,
      addresses: [],
    });
    expectNoSecrets(result.user);
  });

  it('marks an admin', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'ADMIN' }));

    const result = await service.login({
      email: 'ali@example.com',
      password: 'secret1',
    });

    expect(result.user.isAdmin).toBe(true);
  });

  it('puts the token version in the token, so a raised version cancels the old tokens', async () => {
    const { service, prisma, jwt } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser({ tokenVersion: 3 }));

    await service.login({ email: 'ali@example.com', password: 'secret1' });

    expect(jwt.sign).toHaveBeenCalledWith({ id: 'u1', v: 3 });
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeUser());

    const unknownEmail = await failureOf(
      service.login({ email: 'nobody@example.com', password: 'secret1' }),
    );
    const wrongPassword = await failureOf(
      service.login({ email: 'ali@example.com', password: 'wrong-one' }),
    );

    expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect((wrongPassword as Error).message).toBe(
      (unknownEmail as Error).message,
    );
    expect((wrongPassword as Error).message).toBe('Invalid email or password');
  });

  it('tells a Google-only account to use Google (or "Forgot Password")', async () => {
    const { service, prisma, jwt } = setup();
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ password: null, googleId: 'g1' }),
    );

    const error = await failureOf(
      service.login({ email: 'ali@example.com', password: 'anything' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('linked to Google');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});

describe('googleAuth', () => {
  const signedIn = (verifyIdToken: Mock, payload: unknown) =>
    verifyIdToken.mockResolvedValue({ getPayload: () => payload });

  it('asks Google to verify the token for OUR client id', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: object }) =>
      makeUser({ ...data }),
    );

    await service.googleAuth({ idToken: 'tok' });

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: 'client-id',
    });
  });

  it('refuses a token that Google does not accept', async () => {
    const { service, prisma, verifyIdToken } = setup();
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient'));

    const error = await failureOf(service.googleAuth({ idToken: 'tok' }));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error).toHaveProperty('message', 'Invalid Google token');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['no payload', undefined],
    ['no email', googlePayload({ email: undefined })],
    ['no subject', googlePayload({ sub: undefined })],
  ])('refuses a token with %s', async (_label, payload) => {
    const { service, verifyIdToken } = setup();
    signedIn(verifyIdToken, payload);

    const error = await failureOf(service.googleAuth({ idToken: 'tok' }));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error).toHaveProperty('message', 'Google did not return an email');
  });

  it.each([[false], [undefined]])(
    'refuses an email Google has not verified (email_verified: %s)',
    async (flag) => {
      const { service, prisma, verifyIdToken } = setup();
      signedIn(verifyIdToken, googlePayload({ email_verified: flag }));

      const error = await failureOf(service.googleAuth({ idToken: 'tok' }));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty(
        'message',
        'Your Google email is not verified',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('signs a returning Google user in by the Google id, and changes nothing', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique.mockResolvedValueOnce(
      makeUser({ googleId: 'g1', password: null }),
    );

    const result = await service.googleAuth({ idToken: 'tok' });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { googleId: 'g1' },
      include: { addresses: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.passwordRemoved).toBe(false);
    expect(result.user).toMatchObject({ hasPassword: false, hasGoogle: true });
  });

  it('creates an account (without a password) for a new Google user', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: object }) =>
      makeUser({ ...data, id: 'u2' }),
    );

    const result = await service.googleAuth({ idToken: 'tok' });

    // The lookups: first by the Google id, then by the (lowercased) email
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { googleId: 'g1' },
      include: { addresses: true },
    });
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: 'ali@example.com' },
      include: { addresses: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'Ali Google',
        email: 'ali@example.com',
        password: null,
        googleId: 'g1',
        avatar: 'https://pics.example/ali.png',
      },
      include: { addresses: true },
    });
    expect(result.passwordRemoved).toBe(false);
    expect(result.user).toMatchObject({ hasPassword: false, hasGoogle: true });
    expectNoSecrets(result.user);
  });

  it('falls back to a default name and an empty avatar when Google sends none', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(
      verifyIdToken,
      googlePayload({ name: undefined, picture: undefined }),
    );
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: object }) =>
      makeUser({ ...data }),
    );

    await service.googleAuth({ idToken: 'tok' });

    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
      name: 'Google User',
      avatar: '',
    });
  });

  it('links an existing account and REMOVES its password, so whoever registered first loses the way in', async () => {
    const { service, prisma, verifyIdToken, jwt } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeUser());
    prisma.user.update.mockResolvedValue(
      makeUser({ googleId: 'g1', password: null, tokenVersion: 1 }),
    );

    const result = await service.googleAuth({ idToken: 'tok' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        googleId: 'g1',
        password: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        // Every token issued before the link stops working
        tokenVersion: { increment: 1 },
        avatar: 'https://pics.example/ali.png',
      },
      include: { addresses: true },
    });
    expect(result.passwordRemoved).toBe(true);
    // The new token carries the NEW version: the real owner is not logged out by the link
    expect(jwt.sign).toHaveBeenCalledWith({ id: 'u1', v: 1 });
    expect(result.user).toMatchObject({ hasPassword: false, hasGoogle: true });
  });

  it('does not report a removed password when the account had none', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeUser({ password: null }));
    prisma.user.update.mockResolvedValue(
      makeUser({ googleId: 'g1', password: null }),
    );

    const result = await service.googleAuth({ idToken: 'tok' });

    expect(result.passwordRemoved).toBe(false);
  });

  it('keeps the avatar the user already has', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        makeUser({ avatar: 'https://old.example/me.png' }),
      );
    prisma.user.update.mockResolvedValue(
      makeUser({ googleId: 'g1', password: null }),
    );

    await service.googleAuth({ idToken: 'tok' });

    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
      'avatar',
    );
  });

  it('refuses an email that is already linked to a DIFFERENT Google account', async () => {
    const { service, prisma, verifyIdToken } = setup();
    signedIn(verifyIdToken, googlePayload());
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeUser({ googleId: 'g-other' }));

    const error = await failureOf(service.googleAuth({ idToken: 'tok' }));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('setPassword', () => {
  it('lets a Google account without a password add one (stored as a hash)', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ password: null, googleId: 'g1' }),
    );
    prisma.user.update.mockResolvedValue(
      makeUser({ password: 'hashed:newpass1', googleId: 'g1' }),
    );

    const result = await service.setPassword('u1', { password: 'newpass1' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: 'hashed:newpass1' },
    });
    expect(result.user).toMatchObject({ hasPassword: true, hasGoogle: true });
    expectNoSecrets(result.user);
  });

  it('refuses an account that already has a password', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const error = await failureOf(
      service.setPassword('u1', { password: 'newpass1' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('already has a password');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers "not found" for a user that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.setPassword('u1', { password: 'newpass1' }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });
});

describe('forgotPassword', () => {
  const SAME_ANSWER = {
    message: 'If that email exists, a reset link has been sent.',
  };

  it('answers the same for an email that is not registered, and does nothing', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword({
      email: 'nobody@example.com',
    });

    expect(result).toEqual(SAME_ANSWER);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('stores only the HASH of the token, valid for one hour, and emails the real token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.forgotPassword({ email: 'Ali@Example.com' });

    expect(result).toEqual(SAME_ANSWER);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ali@example.com' },
    });

    const { to, subject, body } = mail.sendEmail.mock.calls[0][0];
    expect(to).toBe('ali@example.com');
    expect(subject).toBe('Reset your password');

    // The link holds the real token. The database holds only its hash
    const rawToken = /reset-password\?token=([a-f0-9]{64})/.exec(body)?.[1];
    expect(rawToken).toBeDefined();
    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data.passwordResetToken).toBe(sha256(rawToken!));
    expect(data.passwordResetToken).not.toBe(rawToken);
    expect(data.passwordResetExpires).toEqual(
      new Date('2026-01-01T11:00:00.000Z'),
    );
  });

  it('builds the link from CLIENT_URL without a double slash', async () => {
    const { service, prisma, mail } = setup(); // CLIENT_URL is "https://shop.example/" (a trailing slash)
    prisma.user.findUnique.mockResolvedValue(makeUser());

    await service.forgotPassword({ email: 'ali@example.com' });

    const { body } = mail.sendEmail.mock.calls[0][0];
    expect(body).toContain('https://shop.example/reset-password?token=');
    expect(body).not.toContain('shop.example//reset-password');
  });

  it('uses localhost when CLIENT_URL is not set (development)', async () => {
    const { service, prisma, mail } = setup({ CLIENT_URL: undefined });
    prisma.user.findUnique.mockResolvedValue(makeUser());

    await service.forgotPassword({ email: 'ali@example.com' });

    expect(mail.sendEmail.mock.calls[0][0].body).toContain(
      'http://localhost:3000/reset-password?token=',
    );
  });

  it('answers the same when the email cannot be sent (the answer must not reveal who is registered)', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser());
    mail.sendEmail.mockRejectedValue(new Error('smtp is down'));
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await service.forgotPassword({ email: 'ali@example.com' });

    expect(result).toEqual(SAME_ANSWER);
    expect(errorLog).toHaveBeenCalled(); // the failure is in the log, not in the answer
  });

  it('escapes the name inside the email (a name must not inject HTML into a message from our domain)', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ name: '<img src=x onerror=alert(1)>' }),
    );

    await service.forgotPassword({ email: 'ali@example.com' });

    const { body } = mail.sendEmail.mock.calls[0][0];
    expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(body).not.toContain('<img');
  });
});

describe('resetPassword', () => {
  it('checks the token (by its hash) and its expiry, and uses it up, in ONE statement', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
    const { service, prisma } = setup();

    const result = await service.resetPassword({
      token: 'abc',
      password: 'newpass1',
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        passwordResetToken: sha256('abc'),
        passwordResetExpires: { gt: new Date('2026-01-01T10:00:00.000Z') },
      },
      data: {
        password: 'hashed:newpass1',
        passwordResetToken: null,
        passwordResetExpires: null,
        // The old sessions end: whoever knew the old password is out
        tokenVersion: { increment: 1 },
      },
    });
    expect(result).toEqual({
      message: 'Password reset successfully. You can now sign in.',
    });
  });

  it('refuses a link that is invalid, expired or already used', async () => {
    const { service, prisma } = setup();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    const error = await failureOf(
      service.resetPassword({ token: 'abc', password: 'newpass1' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'This reset link is invalid or has expired.',
    );
  });
});
