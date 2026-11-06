import { createUserSession, getDb, withUserTenant } from '@kestrel/db';
import { logErrorContext } from '@kestrel/shared/logger';
import { AuthError, type Session, type User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import { assertProductionSecurity } from '@/lib/http/security-invariants';

import { sessionValidationNeedsDb, validateSession } from './session-validators';

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
      // R1: createUserSession opens the user's tenant scope internally —
      // `user_sessions` is RLS-protected and this callback runs before any
      // request transaction exists.
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

  const nowSeconds = Math.floor(Date.now() / 1000);
  const userId = token.id;

  try {
    // the session callback runs on every `auth()` call,
    // before any route handler opens a tenant transaction, and
    // `user_sessions` carries RLS. Whenever the throttles say a check is due,
    // run it in the user's tenant scope — otherwise the session row is
    // invisible, the token is treated as revoked, and users bounce to /login.
    // A fully throttled call touches no database and opens no scope.
    const invalidated =
      userId && sessionValidationNeedsDb(token, nowSeconds)
        ? await withUserTenant(userId, (scopedDb) =>
            validateSession(scopedDb, token, session, nowSeconds, { failClosed: true }),
          )
        : await validateSession(db, token, session, nowSeconds, { failClosed: true });
    return (invalidated as AuthSession | null) ?? session;
  } catch (err) {
    // Scope establishment failed (missing membership, pool error) — fail
    // closed rather than serving a session whose security checks never ran.
    logErrorContext(err, 'auth/session_scope', { userId: userId ?? '' }, 'auth');
    return { ...session, user: undefined, expires: '0' };
  }
}
