import { getDb } from '@kestrel/ai';
import type { DbClient } from '@kestrel/db';
import { schema, withRateLimit } from '@kestrel/db';
import { decryptSecret } from '@kestrel/shared/encryption';
import { logErrorContext } from '@kestrel/shared/logger';
import bcrypt from 'bcryptjs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { verifySync } from 'otplib';

import { recordAuthEvent } from '@/lib/auth-anomaly';
import { assertProductionSecurity } from '@/lib/security-invariants';
import { DUMMY_PASSWORD_HASH, normalizeCredential, normalizeEmail } from './credentials';

export async function authorizeCredentials(credentials: Record<string, unknown> | undefined) {
  assertProductionSecurity();
  const email = normalizeEmail(credentials?.email);
  const password = normalizeCredential(credentials?.password);
  if (!email || !password) return null;

  const db = getDb();
  let user:
    | {
        id: string; email: string; name: string | null; image: string | null;
        hashedPassword: string | null; tokenVersion: number; twoFactorEnabled: boolean;
        twoFactorSecret: string | null; lockedUntil: Date | null; failedLoginAttempts: number;
        twoFactorBackupCodes: string[] | null; failed2faAttempts: number;
        twoFactorLockedUntil: Date | null; emailVerified: Date | null;
      }
    | undefined;
  try {
    [user] = await db.select({
      id: schema.users.id, email: schema.users.email, name: schema.users.name,
      image: schema.users.image, hashedPassword: schema.users.hashedPassword,
      tokenVersion: schema.users.tokenVersion, twoFactorEnabled: schema.users.twoFactorEnabled,
      twoFactorSecret: schema.users.twoFactorSecret, lockedUntil: schema.users.lockedUntil,
      failedLoginAttempts: schema.users.failedLoginAttempts,
      twoFactorBackupCodes: schema.users.twoFactorBackupCodes,
      failed2faAttempts: schema.users.failed2faAttempts,
      twoFactorLockedUntil: schema.users.twoFactorLockedUntil,
      emailVerified: schema.users.emailVerified,
    }).from(schema.users).where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt))).limit(1);
  } catch (err) {
    logErrorContext(err, 'auth/db_fetch_user_failed', {}, 'auth');
    return null;
  }

  if (!user || !user.hashedPassword) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    recordAuthEvent('account_locked');
    throw new AuthError('ACCOUNT_LOCKED');
  }

  let passwordValid = false;
  try { passwordValid = await bcrypt.compare(password, user.hashedPassword); }
  catch (err) { logErrorContext(err, 'auth/bcrypt_error', {}, 'auth'); return null; }
  if (!passwordValid) {
    try {
      const [updated] = await db.update(schema.users).set({
        failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
        lockedUntil: sql`CASE WHEN ${schema.users.failedLoginAttempts} + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END`,
      }).where(eq(schema.users.id, user.id)).returning({ id: schema.users.id });
      if (!updated) throw new Error('Failed login lockout update matched no user');
    } catch (err) {
      logErrorContext(err, 'auth/lockout_increment', { userId: user.id }, 'auth');
      throw new AuthError('AUTH_SYSTEM_ERROR');
    }
    return null;
  }

  try {
    const [updated] = await db.update(schema.users).set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(schema.users.id, user.id)).returning({ id: schema.users.id });
    if (!updated) throw new Error('Failed login lockout reset matched no user');
  } catch (err) {
    logErrorContext(err, 'auth/lockout_reset', { userId: user.id }, 'auth');
    throw new AuthError('AUTH_SYSTEM_ERROR');
  }

  if (user.twoFactorEnabled) await verifySecondFactor(db, user, credentials);

  const rememberMe = credentials?.rememberMe === 'true';
  const deviceName = typeof credentials?.deviceName === 'string' ? credentials.deviceName.slice(0, 255) || null : null;
  const ip = typeof credentials?.ip === 'string' ? credentials.ip || null : null;
  return { id: user.id, email: user.email, name: user.name, image: user.image,
    tokenVersion: user.tokenVersion, emailVerified: user.emailVerified,
    sessionId: crypto.randomUUID(), deviceName, ip, rememberMe };
}

interface SecondFactorUser {
  id: string;
  twoFactorLockedUntil: Date | null;
  twoFactorSecret: string | null;
  twoFactorBackupCodes: string[] | null;
  failed2faAttempts: number;
}

type AuthDb = DbClient;

async function verifySecondFactor(
  db: AuthDb,
  user: SecondFactorUser,
  credentials: Record<string, unknown> | undefined,
): Promise<void> {
  const code = typeof credentials?.totpCode === 'string' ? credentials.totpCode.trim() : '';
  if (!code) throw new AuthError('2FA_REQUIRED');
  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) throw new AuthError('2FA_LOCKED');
  try {
    if (!(await withRateLimit(user.id, '2fa_verify', 10)).allowed) throw new AuthError('2FA_RATE_LIMITED');
  } catch (err) {
    if (err instanceof AuthError) throw err;
    logErrorContext(err, 'auth/2fa_rate_limit_unavailable', { userId: user.id }, 'auth');
    throw new AuthError('2FA_SYSTEM_ERROR');
  }
  const secret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
  let valid = Boolean(secret && verifySync({ secret, token: code }).valid);
  if (!valid && user.twoFactorBackupCodes?.length) {
    for (const hashed of user.twoFactorBackupCodes) if (await bcrypt.compare(code, hashed)) {
      const [updated] = await db.update(schema.users).set({ twoFactorBackupCodes: sql`array_remove(${schema.users.twoFactorBackupCodes}, ${hashed})` })
        .where(and(eq(schema.users.id, user.id), sql`${schema.users.twoFactorBackupCodes} @> ARRAY[${hashed}]::text[]`)).returning({ id: schema.users.id });
      if (!updated) throw new AuthError('2FA_SYSTEM_ERROR');
      valid = true; break;
    }
  }
  if (!valid) {
    recordAuthEvent('2fa_failure');
    try {
      const [updated] = await db.update(schema.users).set({
        failed2faAttempts: sql`${schema.users.failed2faAttempts} + 1`,
        twoFactorLockedUntil: sql`CASE WHEN ${schema.users.failed2faAttempts} + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END`,
      }).where(eq(schema.users.id, user.id)).returning({ id: schema.users.id });
      if (!updated) throw new Error('Failed 2FA lockout update matched no user');
    } catch (err) {
      logErrorContext(err, 'auth/2fa_lockout_increment', { userId: user.id }, 'auth');
      throw new AuthError('2FA_SYSTEM_ERROR');
    }
    throw new AuthError('INVALID_2FA_CODE');
  }
  try {
    const [updated] = await db.update(schema.users).set({ failed2faAttempts: 0, twoFactorLockedUntil: null })
      .where(eq(schema.users.id, user.id)).returning({ id: schema.users.id });
    if (!updated) throw new Error('Failed 2FA lockout reset matched no user');
  } catch (err) { logErrorContext(err, 'auth/2fa_lockout_reset', { userId: user.id }, 'auth'); throw new AuthError('2FA_SYSTEM_ERROR'); }
}
