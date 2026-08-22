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

import type { ProviderId } from '@kestrel/shared';

/**
 * The persisted chat-model format. The model id is intentionally kept intact:
 * OpenRouter and other gateways use slash-containing model ids.
 */
export function toChatModelValue(providerId: ProviderId | string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** Qualified display/telemetry id used by model metadata. */
export function toQualifiedModelId(providerId: ProviderId | string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

/**
 * Accept the current canonical value plus legacy/provider-qualified values.
 * The legacy aliases keep existing saved selections highlighted after the
 * identifier format was corrected.
 */
export function modelSelectionMatches(
  selection: string | null | undefined,
  providerId: ProviderId | string,
  modelId: string,
): boolean {
  if (!selection) return false;

  const candidates = new Set([
    toChatModelValue(providerId, modelId),
    toQualifiedModelId(providerId, modelId),
  ]);

  // Vertex telemetry uses google-vertex while its persisted provider id is
  // vertex. Older UI paths also used this prefix for display.
  if (providerId === 'vertex') {
    candidates.add(`google-vertex/${modelId}`);
  }

  // Before slash-containing model ids were preserved, the settings endpoint
  // stripped the first segment. Recognize that old value only as a UI alias;
  // new writes always use the exact model id above.
  const slash = modelId.indexOf('/');
  if (slash > 0) {
    const legacyBare = modelId.slice(slash + 1);
    candidates.add(toChatModelValue(providerId, legacyBare));
    candidates.add(toQualifiedModelId(providerId, legacyBare));
  }

  return candidates.has(selection);
}

export function modelLabelFromSelection(selection: string | null | undefined): string {
  if (!selection) return 'Model';
  const separator = selection.indexOf(':');
  const modelId =
    separator >= 0 ? selection.slice(separator + 1) : selection.split('/').slice(1).join('/');
  return modelId || 'Model';
}
