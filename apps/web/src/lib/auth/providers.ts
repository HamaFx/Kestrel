import { eq } from 'drizzle-orm';
import { getDb } from '@kestrel/ai';
import { schema } from '@kestrel/db';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import type { Provider } from 'next-auth/providers';

import { authorizeCredentials } from './credentials-authorize';
import { verifyImpersonationChallenge } from './impersonation';
import { logErrorContext } from '@kestrel/shared/logger';

export function createAuthProviders(authEnv: Record<string, string | undefined>): Provider[] {
  const providers: Provider[] = [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: '2FA Code', type: 'text' },
        rememberMe: { label: 'Remember Me', type: 'text' },
        deviceName: { label: 'Device Name', type: 'text' },
        ip: { label: 'IP Address', type: 'text' },
      },
      async authorize(credentials) {
        return authorizeCredentials(credentials as Record<string, unknown> | undefined);
      },
    }),
  ];

  if (authEnv.AUTH_GOOGLE_ID && authEnv.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: authEnv.AUTH_GOOGLE_ID,
        clientSecret: authEnv.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: false,
      }),
    );
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.ENABLE_IMPERSONATION === 'true' &&
    process.env.ALLOW_INSECURE_DEV_AUTH === 'true'
  ) {
    providers.push(
      Credentials({
        id: 'impersonate',
        name: 'Impersonation',
        credentials: {
          userId: { label: 'User ID', type: 'text' },
          challenge: { label: 'Admin Challenge Token', type: 'text' },
        },
        async authorize(credentials) {
          const userId = typeof credentials?.userId === 'string' ? credentials.userId : '';
          const challenge = typeof credentials?.challenge === 'string' ? credentials.challenge : '';
          if (!userId || !challenge || !verifyImpersonationChallenge(challenge)) {
            logErrorContext(new Error('Impersonation challenge verification failed'), 'auth/impersonation_challenge', { userId }, 'auth');
            return null;
          }
          const [user] = await getDb().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name, image: user.image, tokenVersion: user.tokenVersion, sessionId: '', rememberMe: false };
        },
      }),
    );
  }
  return providers;
}
