/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// SPDX-License-Identifier: Apache-2.0

// POST /api/chat/mutations/confirm
// Body: { runId: string, confirmationToken: string }
//
// The server derives mutation, user, and thread context from the persisted
// workflow snapshot. The business write, audit row, and mutation execution
// ledger are committed atomically by executeMutationOnce.

import { withAuth } from '@/lib/http/api';

import { handleConfirmMutation } from './_lib/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: Request, { user }) => {
  return handleConfirmMutation(req, user);
});
