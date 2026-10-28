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

// Per-turn tool context — Phase 3 hardening §1.
//
// Tools used to discover their thread + env via module-global setters
// Phase A: added `userId` for multi-user scoping. All tools that
// write to the DB or call user-scoped services must extract userId
// from this context rather than assuming a single global user.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { DbClient } from '@kestrel/db';
import type { UserSettingsRow } from '@kestrel/db/schema';
import type { ServerEnv } from '@kestrel/shared';

import type { GenerationLedger } from '../persistence/generation-ledger';

/** The slice of env tools may need at runtime. */
export type ToolEnv = Pick<
  ServerEnv,
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'AI_DEFAULT_MODEL'
  | 'AI_EMBEDDING_MODEL'
  | 'MAX_DAILY_USD'
  | 'LOG_PROMPTS'
> &
  Partial<
    Pick<
      ServerEnv,
      | 'EXA_API_KEY'
      | 'TAVILY_API_KEY'
      | 'BRAVE_SEARCH_API_KEY'
      | 'WEB_SEARCH_ENABLED'
      | 'WEB_SEARCH_PROVIDER'
      | 'WEB_SEARCH_FALLBACK_PROVIDERS'
      | 'WEB_SEARCH_MAX_RESULTS'
      | 'WEB_SEARCH_MAX_CALLS_PER_TURN'
      | 'WEB_SEARCH_CACHE_TTL_SECONDS'
      | 'WEB_SEARCH_TIMEOUT_MS'
      // Phase 2 (Jev) — RAG/web-search quarantine & rerank key resolution.
      | 'OPENCODE_API_KEY'
      | 'TYPESAFE_API_KEY'
      | 'JEV_BASE_URL'
    >
  >;

/**
 * P0-2 — Database abstraction injected into tools via ToolContext.
 * Tools use this instead of importing `getDb()` from `@kestrel/db`.
 * The type is the Drizzle client (re-exported from @kestrel/db);
 * in tests, a mock can be injected.
 */
export type ToolDb = DbClient;

/** M4: Batched tool-telemetry record — accumulated during a turn and
 *  bulk-inserted at onFinish to reduce DB connection pressure. */
export interface BatchedToolTelemetry {
  threadId: string | null;
  userId?: string | null;
  tool: string;
  ms: number;
  ok: boolean;
  errorCode?: string | null;
  outputChars?: number | null;
}

export interface ToolContext {
  threadId: string;
  /** Phase A — the authenticated user making this request. */
  userId: string;
  /** Latest end-user text for mutation-intent screening. */
  latestUserMessageText?: string | undefined;
  env: ToolEnv;
  signal: AbortSignal | null;
  budget: { spent: number; max: number };
  userSettings: UserSettingsRow;
  /**
   * P0-2 — Database client injected by runChat(). Tools use this
   * instead of importing `getDb()` from `@kestrel/db` directly.
   * DIP: tools depend on an injected abstraction, not a module-level
   * singleton. In tests, a mock can be injected via withToolContext().
   *
   * Optional for backward compatibility with test contexts that
   * construct ToolContext without DB access.
   */
  db?: ToolDb | undefined;
  /** M4: Buffer for batching tool telemetry inserts. Optional — callers
   *  that don't pass it get direct inserts (backward-compatible). */
  toolTelemetryBuffer?: BatchedToolTelemetry[] | undefined;
  /** Number of live web searches made during this turn. */
  webSearchCalls?: number | undefined;
  /** Generation ledger for tracking auxiliary spend. */
  ledger?: GenerationLedger | undefined;
}

const store = new AsyncLocalStorage<ToolContext>();

export function withToolContext<T>(ctx: ToolContext, fn: () => Promise<T>): Promise<T> {
  // M4: Ensure tool telemetry buffer is initialized.
  if (!ctx.toolTelemetryBuffer) ctx.toolTelemetryBuffer = [];
  return store.run(ctx, fn);
}

export function getToolContext(): ToolContext {
  const ctx = store.getStore();
  if (!ctx) {
    throw new Error(
      'getToolContext() called outside withToolContext — tool execution must be bootstrapped by runChat()',
    );
  }
  return ctx;
}

export function maybeGetToolContext(): ToolContext | null {
  return store.getStore() ?? null;
}

export interface CreateToolContextOptions {
  threadId: string;
  userId: string;
  latestUserMessageText?: string | undefined;
  env?: Partial<ToolEnv> | undefined;
  signal?: AbortSignal | null | undefined;
  budget?: { spent: number; max: number } | undefined;
  userSettings?: UserSettingsRow | Partial<UserSettingsRow> | null | undefined;
  db?: ToolDb | undefined;
  toolTelemetryBuffer?: BatchedToolTelemetry[] | undefined;
  webSearchCalls?: number | undefined;
  /** Turn-level generation ledger so tools can bill auxiliary spend (e.g. nested committee runs). */
  ledger?: GenerationLedger | undefined;
}

export function createToolContext(options: CreateToolContextOptions): ToolContext {
  const ctx: ToolContext = {
    threadId: options.threadId,
    userId: options.userId,
    latestUserMessageText: options.latestUserMessageText,
    env: (options.env ?? {}) as ToolEnv,
    signal: options.signal ?? null,
    budget: options.budget ?? { spent: 0, max: 10 },
    userSettings: (options.userSettings ?? {}) as UserSettingsRow,
    db: options.db,
    toolTelemetryBuffer: options.toolTelemetryBuffer ?? [],
    webSearchCalls: options.webSearchCalls ?? 0,
    ledger: options.ledger,
  };
  return ctx;
}
