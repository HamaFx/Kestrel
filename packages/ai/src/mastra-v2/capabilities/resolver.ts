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

// Runtime capability resolution: manifest lookups, UI/telemetry metadata,
// guardrail policy derivation, and the server-side request boundary.

import type { ToolName } from '@kestrel/shared';

import { MASTRA_CAPABILITIES, type MastraCapabilityId, type MastraRoutingDomain } from './catalog';
import type {
  MastraCapability,
  MastraCapabilityDecision,
  MastraCapabilityRejectionReason,
  MastraCapabilityRequest,
  MastraCapabilityUiMetadata,
  MastraGuardrailPolicy,
} from './types';

/**
 * Audit plan §1.2 — guardrail policy derives from the manifest's trust level,
 * never from `NODE_ENV`. Capabilities that surface untrusted external data
 * (news, calendar, social sentiment, web search) fail closed: `strict + block`.
 * Trusted-only capabilities degrade gracefully (`availability + rewrite`).
 */
export function guardrailPolicyForCapability(
  capability: Pick<MastraCapability, 'contentTrust'>,
): MastraGuardrailPolicy {
  return capability.contentTrust === 'untrusted'
    ? { mode: 'strict', strategy: 'block' }
    : { mode: 'availability', strategy: 'rewrite' };
}

/** Read-only manifest metadata used by route, tool, and telemetry consumers. */
export function manifestForCapability(capabilityId: MastraCapabilityId): MastraCapability {
  return MASTRA_CAPABILITIES[capabilityId];
}

export function manifestToolNames(capabilityId: MastraCapabilityId): readonly string[] {
  return manifestForCapability(capabilityId).toolMetadata.map((tool) => tool.name);
}

export function manifestToolsForDomain(domain: MastraRoutingDomain): readonly string[] {
  return MASTRA_CAPABILITIES['canonical-chat'].domainTools?.[domain] ?? [];
}

export function capabilityUiMetadata(capabilityId: MastraCapabilityId): MastraCapabilityUiMetadata {
  const capability = manifestForCapability(capabilityId);
  return {
    id: capability.id,
    version: capability.version,
    route: capability.route,
    component: capability.component,
    scope: capability.scope,
    readOnly: capability.readOnly,
    supportsStreaming: capability.supportsStreaming,
    maxSteps: capability.maxSteps,
    maxDurationMs: capability.maxDurationMs,
    tools: capability.toolMetadata,
  };
}

export function capabilityTelemetryLabels(
  capabilityId: MastraCapabilityId,
): Record<string, string> {
  const capability = manifestForCapability(capabilityId);
  return {
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    capabilityRoute: capability.route,
    capabilityScope: capability.scope,
  };
}

/** Resolve a capability without allowing unknown IDs to fall through. */
export function getMastraCapability(capabilityId: string): MastraCapability | null {
  return MASTRA_CAPABILITIES[capabilityId as MastraCapabilityId] ?? null;
}

/**
 * Apply the server-side capability boundary before model execution.
 *
 * This policy intentionally does not inspect model output. Symbol, mode,
 * mutation, and confirmation permissions are properties of the request and
 * route, not decisions delegated to the model.
 */
export function evaluateMastraCapability(
  request: MastraCapabilityRequest,
): MastraCapabilityDecision {
  const capability = getMastraCapability(request.capabilityId);
  if (!capability) {
    return { allowed: false, capability: null, reason: 'unknown-capability' };
  }

  if (!capability.allowedSymbols.includes(request.symbol)) {
    return { allowed: false, capability, reason: 'unsupported-symbol' };
  }

  if (!capability.allowedModes.includes(request.mode)) {
    return { allowed: false, capability, reason: 'unsupported-mode' };
  }

  if (request.hasModelOverride) {
    return { allowed: false, capability, reason: 'model-override' };
  }

  if (request.mutationRequested && capability.readOnly) {
    return { allowed: false, capability, reason: 'mutation-request' };
  }

  if (
    request.mutationRequested &&
    !capability.readOnly &&
    process.env.ENABLE_MASTRA_MUTATIONS !== 'true'
  ) {
    return { allowed: false, capability, reason: 'mutations-disabled' };
  }

  if (capability.requiresConfirmation && !request.confirmed) {
    return { allowed: false, capability, reason: 'confirmation-required' };
  }

  return { allowed: true, capability };
}

/**
 * Type-level assertion for the current capability tool lists.
 * The legacy tool-name union is intentionally not used for Mastra tool IDs.
 */
export type MastraCapabilityToolName =
  ToolName | (typeof MASTRA_CAPABILITIES)[MastraCapabilityId]['tools'][number];

export type { MastraCapabilityDecision, MastraCapabilityRejectionReason, MastraCapabilityRequest };
