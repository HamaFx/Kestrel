import NextAuth, { type Account, type Profile, type Session, type User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import { handleJwtCallback, handleSessionCallback } from '@/lib/auth/callbacks';
import { generateImpersonationChallenge } from '@/lib/auth/impersonation';
import { createAuthProviders } from '@/lib/auth/providers';
import { provisionUserOnSignIn } from '@/lib/auth/provision-user';
import { getAuthEnv } from '@/lib/env';
import { assertProductionSecurity } from '@/lib/security-invariants';

import { authConfig } from './auth.config';

export { generateImpersonationChallenge };

// Auth.js's generated handler types reference private package paths under
// pnpm's layout; retain the narrow compatibility cast only at this boundary.
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
    async signIn({
      user,
      account,
      profile,
    }: {
      user: User & {
        tokenVersion?: number;
        emailVerified?: Date | null;
        rememberMe?: boolean;
        sessionId?: string;
        deviceName?: string | null;
        ip?: string | null;
      };
      account?: Account | null;
      profile?: Profile;
    }) {
      assertProductionSecurity();
      const decision = await provisionUserOnSignIn({ user, account: account ?? null, profile });
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
    async jwt({
      token,
      user,
    }: {
      token: JWT;
      user?: User & Parameters<typeof handleJwtCallback>[1];
    }) {
      return handleJwtCallback(token, user);
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      return handleSessionCallback(session, token);
    },
  },
});
