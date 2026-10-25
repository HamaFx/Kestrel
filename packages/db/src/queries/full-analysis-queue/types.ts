/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Input/option shapes and the queue-health snapshot type for the
// Full-analysis queue. Kept dependency-free so every sibling can import it.

import type { DbClient } from '../../client';

export interface EnqueueFullAnalysisQueueInput {
  runId: string;
  userId: string;
  threadId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  db?: DbClient;
}

export interface ClaimFullAnalysisQueueOptions {
  workerRunId: string;
  leaseMs: number;
  /** Optional tenant partition predicate evaluated before the atomic claim. */
  ownsTenant?: (tenantId: string) => boolean;
  db?: DbClient;
}

export interface FullAnalysisLeaseInput {
  runId: string;
  workerRunId: string;
  db?: DbClient;
}

export interface FullAnalysisLedgerSnapshotPayload {
  entries: Array<{ id: string; kind: string; costUsd: number }>;
  totalCostUsd: number;
}

export interface FullAnalysisQueueStats {
  pending: number;
  running: number;
  stalePending: number;
  stuckRunning: number;
}
