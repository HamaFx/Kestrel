/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Full-analysis queue queries — barrel for the split modules.
//
// Every name previously exported from `src/queries/full-analysis-queue.ts` is
// re-exported here so `./queries/full-analysis-queue`, `../src/queries/...`
// and `@kestrel/db` imports keep resolving unchanged.

export {
  FullAnalysisQueueCancelledError,
  FullAnalysisQueueOwnershipError,
  FullAnalysisQueuePayloadError,
} from './errors';
export type {
  ClaimFullAnalysisQueueOptions,
  EnqueueFullAnalysisQueueInput,
  FullAnalysisLedgerSnapshotPayload,
  FullAnalysisLeaseInput,
  FullAnalysisQueueStats,
} from './types';
export { enqueueFullAnalysisQueue } from './enqueue';
export { claimNextFullAnalysisQueue } from './claim';
export {
  completeFullAnalysisQueue,
  failFullAnalysisQueue,
  heartbeatFullAnalysisQueue,
  requeueFullAnalysisQueue,
  updateFullAnalysisQueueProgress,
} from './lifecycle';
export { getFullAnalysisQueueRow, listFullAnalysisQueueRows } from './reads';
export { cancelFullAnalysisQueue } from './cancel';
export {
  purgeOldFullAnalysisQueue,
  purgeOldFullAnalysisQueueWithIds,
  recoverStaleFullAnalysisQueue,
} from './maintenance';
export { getFullAnalysisQueueStats } from './stats';
