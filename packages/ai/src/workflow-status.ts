/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { z } from 'zod';

/** Canonical status vocabulary shared by API, DB, and Mastra projections. */
export const WorkflowStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'blocked',
]);

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export function normalizeWorkflowStatus(value: unknown): WorkflowStatus {
  switch (value) {
    case 'complete':
    case 'success':
    case 'completed':
      return 'succeeded';
    case 'ready':
      return 'succeeded';
    case 'retrying':
      return 'pending';
    case 'error':
      return 'failed';
    case 'pending':
    case 'running':
    case 'failed':
    case 'cancelled':
    case 'blocked':
    case 'succeeded':
      return value;
    default:
      return 'pending';
  }
}

export function toMastraWorkflowStatus(status: WorkflowStatus): 'pending' | 'running' | 'success' | 'failed' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'cancelled':
    case 'blocked':
      return 'failed';
    case 'running':
      return 'running';
    case 'pending':
      return 'pending';
  }
}

export function toApiWorkflowStatus(status: WorkflowStatus): 'pending' | 'running' | 'complete' | 'failed' {
  switch (status) {
    case 'succeeded':
      return 'complete';
    case 'failed':
    case 'cancelled':
    case 'blocked':
      return 'failed';
    case 'running':
      return 'running';
    case 'pending':
      return 'pending';
  }
}
