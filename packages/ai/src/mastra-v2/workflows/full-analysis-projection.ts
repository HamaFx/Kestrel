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

// Mastra workflow-snapshot projection for the durable queue row.

import { getFullAnalysisQueueRow, type FullAnalysisQueueRow } from '@kestrel/db';
import { safeParseJson } from '@kestrel/shared';
import type { WorkflowsStorage } from '@mastra/core/storage';
import type { WorkflowRunState } from '@mastra/core/workflows';

import { getDb } from '../../runtime/db';
import { normalizeWorkflowStatus, toMastraWorkflowStatus } from '../../runtime/workflow-status';
import { getKestrelMastra } from '../instance';
import { flog, parsePayload, serializeError } from './full-analysis-payload';
import { FULL_ANALYSIS_WORKFLOW_ID, type FullAnalysisPayload } from './full-analysis-types';

export async function workflowsStore(): Promise<WorkflowsStorage | undefined> {
  try {
    const instance = getKestrelMastra();
    if (!instance) return undefined;
    const storage = instance.instance.getStorage();
    if (!storage) return undefined;
    return (await storage.getStore('workflows')) as WorkflowsStorage | undefined;
  } catch {
    return undefined;
  }
}

interface ParsedSnapshot {
  runId?: string;
  context?: { input?: unknown } & Record<string, unknown>;
  [key: string]: unknown;
}

export function parseSnapshot(value: unknown): ParsedSnapshot | null {
  if (typeof value === 'string') {
    return safeParseJson<ParsedSnapshot | null>(value, null);
  }
  return value && typeof value === 'object' ? (value as ParsedSnapshot) : null;
}

function projectionContext(payload: FullAnalysisPayload): WorkflowRunState['context'] {
  return { input: payload } as unknown as WorkflowRunState['context'];
}

function isResearchWorkflowInput(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.prompt === 'string' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.mode === 'string'
  );
}

function minimalSnapshot(
  runId: string,
  status: 'pending' | 'running' | 'success' | 'failed',
  payload: FullAnalysisPayload,
  result?: Record<string, unknown>,
  error?: string,
): WorkflowRunState {
  return {
    runId,
    status,
    value: {},
    context: projectionContext(payload),
    serializedStepGraph: [],
    activePaths: [],
    activeStepsPath: {},
    suspendedPaths: {},
    resumeLabels: {},
    waitingPaths: {},
    ...(result ? { result: result as never } : {}),
    ...(error ? { error: { name: 'FullAnalysisError', message: error } } : {}),
    timestamp: Date.now(),
  } as unknown as WorkflowRunState;
}

export async function projectQueueRow(row: FullAnalysisQueueRow): Promise<void> {
  const payload = parsePayload(row.payload);
  const store = await workflowsStore();
  if (!store) return;
  try {
    const existing = await store.getWorkflowRunById({
      runId: row.runId,
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    });
    const snapshot = parseSnapshot(existing?.snapshot);
    const normalizedStatus = normalizeWorkflowStatus(
      row.status === 'pending' && isResearchWorkflowInput(snapshot?.context?.input)
        ? 'running'
        : row.status,
    );
    const next = {
      ...(snapshot ??
        minimalSnapshot(row.runId, toMastraWorkflowStatus(normalizedStatus), payload)),
      runId: row.runId,
      status: toMastraWorkflowStatus(normalizedStatus),
      context: snapshot?.context ?? projectionContext(payload),
      ...(row.result ? { result: row.result } : {}),
      ...(row.progress ? { progress: row.progress } : {}),
      ...(row.error ? { error: { name: 'FullAnalysisError', message: row.error } } : {}),
      timestamp: Date.now(),
    } as unknown as WorkflowRunState;
    await store.persistWorkflowSnapshot({
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
      runId: row.runId,
      resourceId: row.userId,
      snapshot: next,
    });
  } catch (error) {
    flog.warn('Full-analysis Mastra projection failed', {
      runId: row.runId,
      status: row.status,
      error: serializeError(error),
    });
  }
}

export async function projectTerminalSnapshot(
  runId: string,
  result: Record<string, unknown>,
): Promise<void> {
  try {
    const row = await getFullAnalysisQueueRow(runId, undefined, getDb());
    if (!row) return;
    await projectQueueRow({
      ...row,
      status: 'succeeded',
      result,
      error: null,
      completedAt: new Date(),
    });
  } catch (error) {
    flog.warn('Full-analysis terminal snapshot pre-projection failed', {
      runId,
      error: serializeError(error),
    });
  }
}
