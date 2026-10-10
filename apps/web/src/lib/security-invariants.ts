/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// SPDX-License-Identifier: Apache-2.0

/**
 * Validate invariants that must hold whenever authentication handles a
 * production request. Kept free of Node-only imports so Edge-safe auth config
 * and Node auth callbacks can share exactly the same policy.
 */
export function assertProductionSecurity(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.AUTH_SECRET &&
    !process.env.NEXTAUTH_SECRET
  ) {
    throw new Error(
      '[SECURITY] AUTH_SECRET (or NEXTAUTH_SECRET) must be set in production. ' +
        'Generate: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"',
    );
  }
}
