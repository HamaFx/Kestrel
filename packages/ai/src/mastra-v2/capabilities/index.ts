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

// Capability manifest public surface. The static registry (`catalog.ts`),
// XAUUSD reservations (`catalog-xauusd.ts`), runtime lookup (`resolver.ts`),
// and integrity assertion (`integrity.ts`) stay independently testable.

export {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from './tool-names';
export { MASTRA_CAPABILITIES, type MastraCapabilityId, type MastraRoutingDomain } from './catalog';
export * from './types';
export {
  capabilityTelemetryLabels,
  capabilityUiMetadata,
  evaluateMastraCapability,
  getMastraCapability,
  guardrailPolicyForCapability,
  manifestForCapability,
  manifestToolNames,
  manifestToolsForDomain,
  type MastraCapabilityToolName,
} from './resolver';
export { assertCapabilityManifestIntegrity } from './integrity';
