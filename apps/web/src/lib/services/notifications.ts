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

// SPDX-License-Identifier: Apache-2.0

// Notification preferences, delivery routing, and web-push subscriptions.
//
// Partial-update cleaning lives here so GET/PUT handlers and any future
// workers share the same merge semantics.

import 'server-only';

import {
  deletePushSubscriptionByEndpoint,
  getNoiseConfig,
  getRouteConfig,
  saveNoiseConfig,
  savePushSubscription,
  saveRouteConfig,
} from '@kestrel/ai';
import type { NoiseConfig, RouteConfig } from '@kestrel/shared';

export { PushSubscriptionConflictError } from '@kestrel/ai';

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

export async function getRouteConfigService(userId: string): Promise<{ config: RouteConfig }> {
  return { config: await getRouteConfig(userId) };
}

export async function updateRouteConfigService(
  userId: string,
  input: Partial<RouteConfig>,
): Promise<{ config: RouteConfig }> {
  return { config: await saveRouteConfig(userId, stripUndefined(input)) };
}

export async function getNoiseConfigService(userId: string): Promise<{ config: NoiseConfig }> {
  return { config: await getNoiseConfig(userId) };
}

export async function updateNoiseConfigService(
  userId: string,
  input: Partial<NoiseConfig>,
): Promise<{ config: NoiseConfig }> {
  return { config: await saveNoiseConfig(userId, stripUndefined(input)) };
}

export interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export async function subscribePushService(input: PushSubscriptionInput) {
  const row = await savePushSubscription(input);
  return { id: row.id };
}

export async function unsubscribePushService(userId: string, endpoint: string): Promise<void> {
  await deletePushSubscriptionByEndpoint(userId, endpoint);
}
