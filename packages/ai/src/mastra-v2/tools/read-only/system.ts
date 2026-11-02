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

// Phase 4 Task 2 — native Mastra registrations for the system-domain read-only
// tools. Each registration wraps the existing deterministic execute core via
// `createReadOnlyToolExecute`; there is no runtime adaptation step.
//
// Built lazily (see `read-only/index.ts`): reading the legacy tool bindings at
// module scope would race the `instance ↔ tools` import cycle.

import {
  ConveneCommitteeInputSchema,
  GetSystemDiagnosticsInputSchema,
  VerifyCallInputSchema,
  type ConveneCommitteeOutput,
  type GetSystemDiagnosticsOutput,
  type VerifyCallOutput,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';

import { conveneCommitteeTool } from '@ai/tools/convene-committee';
import {
  GetSocialSentimentInputSchema,
  getSocialSentimentTool,
  type GetSocialSentimentOutput,
} from '@ai/tools/get-social-sentiment';
import { getSystemDiagnosticsTool } from '@ai/tools/get-system-diagnostics';
import { verifyCallTool } from '@ai/tools/verify-call';
import {
  createReadOnlyToolExecute,
  executeLegacyReadOnlyTool,
  readOnlyToolDescription,
} from '@ai/mastra-v2/agents/xauusd/legacy-tool-adapter';

/** Native system-domain read-only tools by registry name. */
export function buildSystemReadOnlyTools(): Readonly<Record<string, unknown>> {
  return {
    get_system_diagnostics: createTool({
      id: 'kestrel-get_system_diagnostics',
      description: readOnlyToolDescription(getSystemDiagnosticsTool, 'get_system_diagnostics'),
      inputSchema: GetSystemDiagnosticsInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetSystemDiagnosticsInputSchema>,
        GetSystemDiagnosticsOutput
      >('kestrel-get_system_diagnostics', 'get_system_diagnostics', (input, context) =>
        executeLegacyReadOnlyTool(getSystemDiagnosticsTool, input, context),
      ),
    }),
    get_social_sentiment: createTool({
      id: 'kestrel-get_social_sentiment',
      description: readOnlyToolDescription(getSocialSentimentTool, 'get_social_sentiment'),
      inputSchema: GetSocialSentimentInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof GetSocialSentimentInputSchema>,
        GetSocialSentimentOutput
      >('kestrel-get_social_sentiment', 'get_social_sentiment', (input, context) =>
        executeLegacyReadOnlyTool(getSocialSentimentTool, input, context),
      ),
    }),
    verify_call: createTool({
      id: 'kestrel-verify_call',
      description: readOnlyToolDescription(verifyCallTool, 'verify_call'),
      inputSchema: VerifyCallInputSchema,
      execute: createReadOnlyToolExecute<z.infer<typeof VerifyCallInputSchema>, VerifyCallOutput>(
        'kestrel-verify_call',
        'verify_call',
        (input, context) => executeLegacyReadOnlyTool(verifyCallTool, input, context),
      ),
    }),
    convene_committee: createTool({
      id: 'kestrel-convene_committee',
      description: readOnlyToolDescription(conveneCommitteeTool, 'convene_committee'),
      inputSchema: ConveneCommitteeInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof ConveneCommitteeInputSchema>,
        ConveneCommitteeOutput
      >('kestrel-convene_committee', 'convene_committee', (input, context) =>
        executeLegacyReadOnlyTool(conveneCommitteeTool, input, context),
      ),
    }),
  };
}
