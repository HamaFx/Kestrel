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

import { NextResponse } from 'next/server';

import { errorResponse } from '@/lib/api';
import { hashToken } from '@/lib/auth-tokens';
import {
  AppError,
  deleteVerificationToken,
  findVerificationToken,
  verifyUserEmail,
} from '@/lib/services/api-boundary';

/**
 * GET /api/auth/verify-email?token=...
 * Verifies a user's email address. Only accepts tokens with
 * purpose='email_verify' (P0-6 — prevents cross-flow replay).
 * Single-use: deletes the token on successful verification.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawToken = url.searchParams.get('token');
    if (!rawToken) {
      return errorResponse(new AppError('VALIDATION', 'Missing token', 400), req);
    }

    // P0-6: Hash the incoming raw token and filter by purpose
    const hashedToken = hashToken(rawToken);

    const vt = await findVerificationToken(hashedToken, 'email_verify');

    if (!vt) {
      return errorResponse(new AppError('VALIDATION', 'Invalid or expired token', 400), req);
    }
    await verifyUserEmail(vt.identifier);

    // Single-use: delete after consumption (defense-in-depth: filter by purpose too)
    await deleteVerificationToken(hashedToken, 'email_verify');

    return NextResponse.redirect(new URL('/login?verified=true', req.url));
  } catch (err) {
    return errorResponse(err, req);
  }
}
