import { getDb } from '@kestrel/ai';
import { createUserSession } from '@kestrel/db';
import { logErrorContext } from '@kestrel/shared/logger';
import { AuthError, type Session, type User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import { assertProductionSecurity } from '@/lib/security-invariants';

import { validateSession } from './session-validators';

type AuthUser = User & {
  tokenVersion?: number;
  emailVerified?: Date | null;
  rememberMe?: boolean;
  sessionId?: string;
  deviceName?: string | null;
  ip?: string | null;
};

type AuthSession = Session & {
  sessionId?: string;
  user?: Session['user'] & { emailVerified?: Date | null };
};

export async function handleJwtCallback(token: JWT, user?: AuthUser): Promise<JWT> {
  assertProductionSecurity();
  if (user) {
    token.id = user.id;
    token.tokenVersion = user.tokenVersion ?? 0;
    token.emailVerified = user.emailVerified ?? null;
    token.rememberMe = user.rememberMe === true ? true : undefined;
    const sessionId = user.sessionId || crypto.randomUUID();
    token.sessionId = sessionId;
    try {
      await createUserSession(sessionId, user.id ?? '', user.deviceName ?? null, user.ip ?? null);
    } catch (err) {
      logErrorContext(err, 'auth/session_insert', { userId: user.id ?? '', sessionId }, 'auth');
      throw new AuthError('SESSION_SYSTEM_ERROR');
    }
  }
  token.tokenVersion ??= 0;
  return token;
}

export async function handleSessionCallback(
  session: AuthSession,
  token: JWT & { id?: string; emailVerified?: Date | null; sessionId?: string },
): Promise<AuthSession> {
  assertProductionSecurity();
  if (session.user && token.id) session.user.id = token.id;
  if (token.emailVerified !== undefined && session.user) {
    session.user.emailVerified = token.emailVerified;
  }
  if (token.sessionId) session.sessionId = token.sessionId;

  let db;
  try {
    db = getDb();
  } catch (err) {
    logErrorContext(err, 'auth/session_database_unavailable', {}, 'auth');
    return { ...session, user: undefined, expires: '0' };
  }

  const invalidated = await validateSession(db, token, session, Math.floor(Date.now() / 1000), {
    failClosed: true,
  });
  return (invalidated as AuthSession | null) ?? session;
}
