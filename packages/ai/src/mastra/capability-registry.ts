/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  CANONICAL_READ_ONLY_TOOL_NAMES,
  LEGACY_DOMAIN_TOOL_NAMES,
  MASTRA_CAPABILITIES,
  type MastraCapabilityId,
} from './capabilities';

/**
 * Canonical policy facade. All Mastra component, legacy-domain, and
 * read-only-tool consumers import policy through this module so a new tool
 * cannot be exposed by one route without the reviewed registry being updated.
 */
export const CAPABILITY_REGISTRY = MASTRA_CAPABILITIES;

export const CANONICAL_TOOL_REGISTRY = Object.freeze({
  readOnly: CANONICAL_READ_ONLY_TOOL_NAMES,
  byDomain: LEGACY_DOMAIN_TOOL_NAMES,
});

export type LegacyRoutingDomain = keyof typeof LEGACY_DOMAIN_TOOL_NAMES;

export function toolsForCapability(capabilityId: MastraCapabilityId): readonly string[] {
  return CAPABILITY_REGISTRY[capabilityId].tools;
}

export function isReadOnlyCapability(capabilityId: MastraCapabilityId): boolean {
  return CAPABILITY_REGISTRY[capabilityId].readOnly;
}

export function toolsForRoutingDomain(domain: LegacyRoutingDomain): readonly string[] {
  return CANONICAL_TOOL_REGISTRY.byDomain[domain];
}

export function canonicalReadOnlyToolNames(): readonly string[] {
  return CANONICAL_TOOL_REGISTRY.readOnly;
}
