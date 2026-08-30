/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// URL policy for outbound requests whose target is influenced by a user or
// model. DNS resolution is intentionally left to the caller because this
// synchronous helper is also used in Edge-compatible code; callers handling
// arbitrary hosts must resolve and validate every redirect/final address.

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'instance-data.ec2.internal',
]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return false;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized === '::'
  );
}

/** Return false for non-HTTP(S), local, private, or credential-bearing URLs. */
export function isSafeOutboundHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (isPrivateIpv4(hostname) || isBlockedIpv6(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Require the generic outbound URL policy, throwing a non-sensitive error.
 */
export function assertSafeOutboundHttpUrl(value: string): URL {
  if (!isSafeOutboundHttpUrl(value)) {
    throw new Error('Outbound URL is not allowed');
  }
  return new URL(value);
}
