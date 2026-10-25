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

// Public capability-manifest types. Runtime resolution lives in `resolver.ts`
// and the registry itself in `catalog.ts`.

import type { MastraRoutingDomain } from './catalog';

/** Q2 decision: exactly two analysis modes. */
export type MastraCapabilityMode = 'single' | 'full';
export type MastraEvidencePolicy = 'required' | 'optional' | 'none';
export type MastraCapabilityScope = 'read-only' | 'sensitive-read' | 'user-scoped' | 'admin';
export type MastraContentTrust = 'trusted' | 'untrusted';
export type MastraToolCategory =
  | 'public-market-data'
  | 'user-scoped-data'
  | 'untrusted-external-data'
  | 'internal-verification'
  | 'mutation';
export type MastraToolAccess = 'read-only' | 'sensitive-read' | 'write';

export interface MastraManifestTool {
  readonly name: string;
  readonly category: MastraToolCategory;
  readonly access: MastraToolAccess;
  readonly sensitivity: 'public' | 'user-scoped' | 'internal';
  readonly trust: MastraContentTrust;
}

export interface MastraCapability {
  readonly id: string;
  readonly version: string;
  readonly route: string;
  readonly component: string;
  readonly allowedSymbols: readonly string[];
  readonly allowedModes: readonly MastraCapabilityMode[];
  readonly scope: MastraCapabilityScope;
  readonly readOnly: boolean;
  readonly tools: readonly string[];
  readonly toolMetadata: readonly MastraManifestTool[];
  readonly requiresConfirmation: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsAbort: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly evidencePolicy: MastraEvidencePolicy;
  readonly externalData: boolean;
  readonly contentTrust: MastraContentTrust;
  readonly semanticRecall?: boolean;
  readonly domainTools?: Readonly<Partial<Record<MastraRoutingDomain, readonly string[]>>>;
}

export interface MastraGuardrailPolicy {
  /** `strict` rejects the turn when the detector model cannot load. */
  readonly mode: 'strict' | 'availability';
  /** `block` rejects injections; `rewrite` neutralizes them. */
  readonly strategy: 'block' | 'rewrite';
}

export interface MastraCapabilityUiMetadata {
  readonly id: string;
  readonly version: string;
  readonly route: string;
  readonly component: string;
  readonly scope: MastraCapabilityScope;
  readonly readOnly: boolean;
  readonly supportsStreaming: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly tools: readonly MastraManifestTool[];
}

export type MastraCapabilityRejectionReason =
  | 'unknown-capability'
  | 'unsupported-symbol'
  | 'unsupported-mode'
  | 'model-override'
  | 'mutation-request'
  | 'confirmation-required'
  | 'mutations-disabled';

export interface MastraCapabilityRequest {
  capabilityId: string;
  symbol: string;
  mode: MastraCapabilityMode;
  hasModelOverride?: boolean;
  mutationRequested?: boolean;
  confirmed?: boolean;
}

export type MastraCapabilityDecision =
  | {
      allowed: true;
      capability: MastraCapability;
    }
  | {
      allowed: false;
      capability: MastraCapability | null;
      reason: MastraCapabilityRejectionReason;
    };
