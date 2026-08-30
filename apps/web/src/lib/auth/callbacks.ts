import { createUserSession } from '@kestrel/db';
import { getDb } from '@kestrel/ai';
import { AuthError } from 'next-auth';

import { validateSession } from './session-validators';
import { assertProductionSecurity } from '@/lib/security-invariants';
import { logErrorContext } from '@kestrel/shared/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleJwtCallback(token: any, user: any): Promise<any> {
  assertProductionSecurity();
  if (user) {
    token.id = user.id;
    token.tokenVersion = user.tokenVersion ?? 0;
    token.emailVerified = user.emailVerified ?? null;
    token.rememberMe = user.rememberMe === true ? true : undefined;
    const sessionId = user.sessionId || crypto.randomUUID();
    token.sessionId = sessionId;
    try {
      await createUserSession(
        sessionId,
        user.id,
        (user.deviceName as string) ?? null,
        (user.ip as string) ?? null,
      );
    } catch (err) {
      logErrorContext(err, 'auth/session_insert', { userId: user.id, sessionId }, 'auth');
      throw new AuthError('SESSION_SYSTEM_ERROR');
    }
  }
  token.tokenVersion ??= 0;
  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleSessionCallback(session: any, token: any): Promise<any> {
  assertProductionSecurity();
  if (session.user && token.id) session.user.id = token.id;
  if (token.emailVerified !== undefined) session.user.emailVerified = token.emailVerified;
  if (token.sessionId) session.sessionId = token.sessionId;

  let db;
  try {
    db = getDb();
  } catch (err) {
    logErrorContext(err, 'auth/session_database_unavailable', {}, 'auth');
    return { ...session, user: undefined, expires: '0' };
  }

  const invalidated = await validateSession(
    db,
    token,
    session,
    Math.floor(Date.now() / 1000),
    { failClosed: true },
  );
  return invalidated ?? session;
}
