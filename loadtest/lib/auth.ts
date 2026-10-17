/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import http, { type RefinedResponse, type ResponseType } from 'k6/http';

import { env, type SessionCtx } from '../config/environments.js';
import seededUsersData from './data/seeded-users.json';
import { setCsrfHeader } from './http.js';

interface SeededUserRecord {
  email: string;
  userId?: string;
  tenantId?: string;
  threadId: string;
}

const seededUsers: SeededUserRecord[] = Array.isArray(seededUsersData)
  ? (seededUsersData as SeededUserRecord[]).filter((u) => u.email !== '__placeholder__')
  : [];

export function bootstrapAuth(): SessionCtx[] {
  if (env.authMode === 'legacy') {
    return [{ cookies: {}, csrfToken: '', email: '__system__' }];
  }
  return bootstrapSession();
}

function bootstrapSession(): SessionCtx[] {
  const ctxs: SessionCtx[] = [];
  if (seededUsers.length === 0) {
    throw new Error(
      'No seeded users found in lib/data/seeded-users.json. Run "pnpm --filter @kestrel/loadtest seed" first.',
    );
  }

  for (const user of seededUsers.slice(0, env.userCount)) {
    const loginRes = http.get(`${env.baseUrl}/api/auth/csrf`, {
      tags: { group: 'auth_setup' },
    });

    let csrfSetupToken = '';
    try {
      const body = JSON.parse(loginRes.body as string);
      csrfSetupToken = body.csrfToken ?? '';
    } catch {
      csrfSetupToken = '';
    }

    const callbackRes = http.post(
      `${env.baseUrl}/api/auth/callback/credentials`,
      JSON.stringify({
        csrfToken: csrfSetupToken,
        email: user.email,
        password: env.password,
        redirect: false,
        callbackUrl: `${env.baseUrl}/chat`,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...(csrfSetupToken ? { 'x-csrf-token': csrfSetupToken } : {}),
        },
        tags: { group: 'auth_setup' },
        redirects: 0,
      },
    );

    const sessionCookieName =
      extractCookie(callbackRes, '__Secure-authjs.session-token') !== undefined
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token';
    const sessionCookie = extractCookie(callbackRes, sessionCookieName);
    if (!sessionCookie) {
      throw new Error(
        `Failed to obtain session cookie for ${user.email}. Response status: ${callbackRes.status}`,
      );
    }

    const warmupRes = http.get(`${env.baseUrl}/api/chat/threads`, {
      cookies: { [sessionCookieName]: sessionCookie },
      tags: { group: 'auth_setup' },
    });

    const csrfCookieName =
      extractCookie(warmupRes, '__Host-hfx_csrf') !== undefined ? '__Host-hfx_csrf' : 'hfx_csrf';
    const csrfCookie = extractCookie(warmupRes, csrfCookieName) ?? '';

    ctxs.push({
      cookies: {
        [sessionCookieName]: sessionCookie,
        ...(csrfCookie ? { [csrfCookieName]: csrfCookie } : {}),
      },
      csrfToken: csrfCookie,
      email: user.email,
      userId: user.userId,
      tenantId: user.tenantId,
      threadId: user.threadId,
    });
  }

  return ctxs;
}

export function applyAuth(ctx: SessionCtx): { csrfHeader: Record<string, string> } {
  const jar = http.cookieJar();
  jar.clear(env.baseUrl);

  for (const [name, value] of Object.entries(ctx.cookies)) {
    jar.set(env.baseUrl, name, value);
  }

  const csrfHeader: Record<string, string> = ctx.csrfToken
    ? { 'x-csrf-token': ctx.csrfToken }
    : {};
  setCsrfHeader(csrfHeader);
  return { csrfHeader };
}

export function pickUser(ctxs: SessionCtx[]): SessionCtx {
  if (ctxs.length === 0) {
    throw new Error('No auth contexts available');
  }
  const idx = (__VU * 7919 + __ITER * 6271) % ctxs.length;
  return ctxs[idx]!;
}

function extractCookie(
  res: RefinedResponse<ResponseType | undefined>,
  name: string,
): string | undefined {
  const setCookie = res.headers['Set-Cookie'];
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    const match = c.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}
