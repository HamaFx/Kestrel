import NextAuth from 'next-auth';

import { provisionUserOnSignIn } from '@/lib/auth/provision-user';
import { handleJwtCallback, handleSessionCallback } from '@/lib/auth/callbacks';
import { generateImpersonationChallenge } from '@/lib/auth/impersonation';
import { createAuthProviders } from '@/lib/auth/providers';
import { assertProductionSecurity } from '@/lib/security-invariants';
import { getAuthEnv } from '@/lib/env';

import { authConfig } from './auth.config';

export { generateImpersonationChallenge };

// NextAuth's inferred provider type is not portable across pnpm store layouts.
// Keep the structural cast local so the public auth exports remain stable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _nextAuth = NextAuth as any;

const authEnv = (() => {
  try {
    return getAuthEnv();
  } catch {
    return {} as Record<string, string | undefined>;
  }
})();

export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  providers: createAuthProviders(authEnv),
  callbacks: {
    ...authConfig.callbacks,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account, profile }: { user: any; account: any; profile: any }) {
      assertProductionSecurity();
      const decision = await provisionUserOnSignIn({ user, account, profile });
      if (!decision.allow) return false;
      if (decision.userFields) {
        user.id = decision.userFields.id;
        user.tokenVersion = decision.userFields.tokenVersion;
        user.emailVerified = decision.userFields.emailVerified;
        user.rememberMe = decision.userFields.rememberMe;
        user.sessionId = decision.userFields.sessionId;
      }
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: { token: any; user: any }) {
      return handleJwtCallback(token, user);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: { session: any; token: any }) {
      return handleSessionCallback(session, token);
    },
  },
});
