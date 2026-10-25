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

// Mastra mutation policy barrel (DEC-05 split of mutation-policy.ts).
// Three layers, each with one job:
//
//   - names.ts  — the closed core/plugin/system-action vocabulary
//   - tokens.ts — single-use, expiring confirmation tokens (HMAC proof)
//   - gates.ts  — draft + execute authorization decisions
//
// `pluginWriteTool`/`PluginWriteTool` stay internal to the siblings: the
// plugin registry probe is used only by the gates, never by callers.

export {
  CORE_MUTATION_NAMES,
  MastraMutationNameSchema,
  SYSTEM_ACTION_REGISTRY,
  isCoreMutationName,
  isRegisteredSystemAction,
  type CoreMutationName,
  type MastraMutationName,
  type SystemActionId,
} from './names';
export {
  MUTATION_TOKEN_TTL_MS,
  confirmationSecret,
  issueMutationConfirmationToken,
  storedConfirmationForToken,
  verifyMutationConfirmationToken,
  type IssueConfirmationTokenOptions,
  type MutationConfirmationToken,
  type StoredMutationConfirmation,
  type VerifyConfirmationTokenOptions,
} from './tokens';
export {
  assertMastraMutationAllowed,
  assertMastraMutationDraftAllowed,
  assertRegisteredSystemAction,
  assertSystemActionAuthorized,
  evaluateMastraMutation,
  type MastraMutationDecision,
  type MastraMutationRequest,
  type MastraMutationVerificationOptions,
  type VerifiedMutationApproval,
} from './gates';
