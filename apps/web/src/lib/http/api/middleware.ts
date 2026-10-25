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

// SPDX-License-Identifier: Apache-2.0

// PF-10: compose() middleware chain.

import { getUserFromRequest, unauthorizedResponse, type RequestUser } from './auth';

/**
 * A middleware function in the chain.
 * Takes a request + context and returns a Response or delegates to `next`.
 */
export type Middleware<T, R> = (
  req: Request,
  ctx: { params: Promise<T> } & R,
  next: () => Promise<Response>,
) => Promise<Response>;

/**
 * Compose multiple middleware functions into a single handler.
 *
 * Middleware executes left-to-right. Each middleware can:
 *   - Short-circuit by returning a Response directly
 *   - Delegate to the next middleware by calling `await next()`
 *
 * The innermost middleware is the actual route handler.
 *
 * @example
 * ```ts
 * const GET = compose(
 *   withAuth,
 *   rateLimit(100, '1m'),
 *   async (req, { user }) => {
 *     return Response.json({ hello: user.userId });
 *   },
 * );
 * ```
 */
export function compose<T, R extends Record<string, unknown> = Record<string, unknown>>(
  ...middlewares: Array<Middleware<T, R>>
): (req: Request, ctx: { params: Promise<T> }) => Promise<Response> {
  return async (req: Request, ctx: { params: Promise<T> }): Promise<Response> => {
    let index = -1;

    const dispatch = async (i: number): Promise<Response> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const middleware = middlewares[i];
      if (!middleware) {
        throw new Error('No handler registered');
      }

      return middleware(req, ctx as { params: Promise<T> } & R, async () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}

/**
 * PF-10 — Make `withAuth` compatible with the `compose()` chain.
 * Returns a middleware function that extracts the user and passes
 * it downstream via context.
 */
export function authMiddleware<T>(): Middleware<T, { user: RequestUser }> {
  return async (req, ctx, next) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      return unauthorizedResponse(req);
    }
    return next();
  };
}
