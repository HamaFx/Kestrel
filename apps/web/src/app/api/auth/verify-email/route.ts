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

import { AppError } from '@kestrel/shared';
import { NextResponse } from 'next/server';

import { errorResponse } from '@/lib/http/api';
import { verifyEmailTokenService } from '@/lib/services/auth';

/**
 * GET /api/auth/verify-email?token=...
 * Verifies a user's email address. Only accepts tokens with
 * purpose='email_verify' (P0-6 — prevents cross-flow replay).
 * Single-use: deletes the token on successful verification.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const result = await verifyEmailTokenService(url.searchParams.get('token') ?? '');

    if (!result.ok) {
      const message = result.reason === 'missing' ? 'Missing token' : 'Invalid or expired token';
      return errorResponse(new AppError('VALIDATION', message, 400), req);
    }

    return NextResponse.redirect(new URL('/login?verified=true', req.url));
  } catch (err) {
    return errorResponse(err, req);
  }
}
