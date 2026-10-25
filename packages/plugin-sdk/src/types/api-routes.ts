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

// Public plugin contract — authenticated and public HTTP routes.

import type { PluginId, PluginLogger, PluginStorage } from './core';

export interface PluginApiRouteContext {
  request: Request;
  params: Readonly<Record<string, string>>;
  pluginId: PluginId;
  userId: string;
  tenantId: string;
  settings: Readonly<Record<string, unknown>>;
  storage: PluginStorage;
  log: PluginLogger;
}

export type PluginApiRouteHandler = (ctx: PluginApiRouteContext) => Promise<Response> | Response;

/** Install state resolved for a public (unauthenticated) plugin route. */
export interface PluginPublicInstall {
  userId: string;
  tenantId: string;
  /** Decrypted settings for that user's install. */
  settings: Readonly<Record<string, unknown>>;
  storage: PluginStorage;
}

export interface PluginPublicApiRouteContext {
  request: Request;
  params: Readonly<Record<string, string>>;
  pluginId: PluginId;
  log: PluginLogger;
  /**
   * Resolve an install by user id. Returns null when the user has not
   * installed or enabled this plugin. Public handlers MUST validate their own
   * transport secret (Telegram's `X-Telegram-Bot-Api-Secret-Token`, HMAC, …)
   * before trusting the caller.
   */
  getInstall(userId: string): Promise<PluginPublicInstall | null>;
}

export type PluginPublicApiRouteHandler = (
  ctx: PluginPublicApiRouteContext,
) => Promise<Response> | Response;
