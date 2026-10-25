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

// Public plugin contract — core identity, execution context and storage.
//
// A Kestrel plugin is a *declarative capability bundle*: it never reaches
// into core tables or app internals directly. The host gives it a per-user
// execution context (settings, storage, logger) and the core resolves only
// the tools / skills / jobs / UI slots belonging to plugins the user has
// installed.
//
// This module intentionally has no runtime dependency on Mastra or React so it
// can be imported from the web app, the worker, and plugin packages alike.

/** Stable kebab-case plugin identity, e.g. `paper-trading`. */
export type PluginId = string & {};

export type PluginCategory =
  'trading-execution' | 'quant-research' | 'channels-automation' | 'agents-skills' | 'market-data';

export type PluginInstallMode = 'instant' | 'wizard';

/** Core agents a plugin tool may be attached to. */
export type PluginAgentTarget =
  'canonical-chat' | 'technical' | 'fundamental' | 'risk' | 'sentiment';

export type PluginToolAccess = 'read-only' | 'sensitive-read' | 'write';

export interface PluginLogger {
  debug?(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface PluginStorageEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: Date;
}

/**
 * Zero-migration persistence scoped to (tenant, user, plugin).
 *
 * Backed by `plugin_storage`; a plugin never needs a SQL migration for small
 * JSON documents.
 */
export interface PluginStorage {
  get<T = unknown>(collection: string, key: string): Promise<T | null>;
  set(collection: string, key: string, value: unknown): Promise<void>;
  list<T = unknown>(collection: string): Promise<PluginStorageEntry<T>[]>;
  delete(collection: string, key: string): Promise<void>;
  clear(collection?: string): Promise<void>;
}

export interface PluginExecutionContext {
  pluginId: PluginId;
  userId: string;
  tenantId: string;
  /** Decrypted plugin settings for this user (secret fields already unwrapped). */
  settings: Readonly<Record<string, unknown>>;
  storage: PluginStorage;
  log: PluginLogger;
  signal?: AbortSignal;
  /** Opaque Mastra RequestContext, when the caller has one. */
  requestContext?: unknown;
}

export interface PluginInstalledUser {
  userId: string;
  tenantId: string;
  /** Decrypted plugin settings. */
  settings: Readonly<Record<string, unknown>>;
  /** Storage scoped to this user + plugin (zero-migration data). */
  storage?: PluginStorage;
}
