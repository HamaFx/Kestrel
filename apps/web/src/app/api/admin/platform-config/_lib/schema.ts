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

// PATCH body schema for /api/admin/platform-config.

import { z } from 'zod';

export const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_api_key'),
    providerId: z.string().min(1),
    apiKey: z.string().min(1),
  }),
  z.object({
    action: z.literal('clear_api_key'),
    providerId: z.string().min(1),
  }),
  z.object({
    action: z.literal('update_routing'),
    chatModel: z.string().nullable().optional(),
    visionModel: z.string().nullable().optional(),
    embeddingModel: z.string().nullable().optional(),
    aiFallbackChain: z.array(z.string()).optional(),
    defaultAnalysisMode: z.enum(['single', 'full']).optional(),
    showAgentOpinions: z.boolean().optional(),
    agentModelOverrides: z.record(z.string(), z.string()).optional(),
    customInstructions: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal('update_market_data'),
    marketDataProvider: z.enum(['biquote', 'finnhub', 'live-ticks']),
  }),
  z.object({
    action: z.literal('update_disabled_tools'),
    disabledTools: z.array(z.string()),
  }),
  z.object({
    action: z.literal('update_budget'),
    monthlyBudgetLimit: z.number().nullable().optional(),
    maxDailyUsd: z.number().nullable().optional(),
  }),
]);

export type PlatformConfigPatch = z.infer<typeof PatchSchema>;
