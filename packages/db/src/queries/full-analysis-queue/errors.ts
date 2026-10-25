/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

// Error classes thrown by the Full-analysis queue lease transitions.

export class FullAnalysisQueueOwnershipError extends Error {
  readonly code = 'FULL_ANALYSIS_QUEUE_OWNERSHIP_LOST';

  constructor(message = 'The Full-analysis worker lease is no longer owned.') {
    super(message);
    this.name = 'FullAnalysisQueueOwnershipError';
  }
}

export class FullAnalysisQueueCancelledError extends Error {
  readonly code = 'FULL_ANALYSIS_QUEUE_CANCELLED';

  constructor(message = 'The Full-analysis job was cancelled.') {
    super(message);
    this.name = 'FullAnalysisQueueCancelledError';
  }
}

export class FullAnalysisQueuePayloadError extends Error {
  readonly code = 'FULL_ANALYSIS_QUEUE_PAYLOAD_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'FullAnalysisQueuePayloadError';
  }
}
