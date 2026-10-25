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

// Briefings environment and logger (DEC-05 split from generate.ts). The
// catalog logger is created exactly once here so the emit and persist paths
// share one instance.

import { createCategorizedLogger } from '@kestrel/shared/logger';

export interface BriefingsEnv {
  AI_GATEWAY_API_KEY?: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
  AI_DEFAULT_MODEL: string;
  MAX_DAILY_USD: number;
  LOG_PROMPTS: boolean;
}

export const blog = createCategorizedLogger('ai', { component: 'briefings' });

export function envFromProcess(): BriefingsEnv {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    // Defaults kept in sync with shared env module (packages/shared/src/env.ts).
    AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL ?? 'google/gemini-2.5-flash',
    MAX_DAILY_USD: Number.parseFloat(process.env.MAX_DAILY_USD ?? '5'),
    LOG_PROMPTS: process.env.LOG_PROMPTS === '1',
  };
}
