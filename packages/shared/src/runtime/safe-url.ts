/**
 * Copyright 2026 Kestrel
 * SPDX-License-Identifier: Apache-2.0
 */

const PRIVATE_IPV4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base as string), bits: bits as number }));

function ipv4ToInt(value: string): number {
  return value.split('.').reduce((out, part) => ((out << 8) | Number(part)) >>> 0, 0);
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isPrivateIpv4(hostname: string): boolean {
  const value = ipv4ToInt(hostname);
  return PRIVATE_IPV4.some(({ base, bits }) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function isIpv6(value: string): boolean {
  return value.includes(':') && /^[0-9a-f:]+$/i.test(value);
}

/**
 * Decode the trailing 32 bits of an IPv4-mapped IPv6 literal
 * (`::ffff:127.0.0.1` → `::ffff:7f00:1` after WHATWG URL normalization,
 * and the long `0:0:0:0:0:ffff:7f00:1` spelling) back into a dotted quad so
 * the private-IPv4 ranges apply to it.
 */
function mappedIpv4FromIpv6(host: string): string | null {
  const mapped = /^(?:0:0:0:0:0:|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1]!, 16);
  const low = Number.parseInt(mapped[2]!, 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

// Hostnames that are not IP literals but must never be fetched from a
// user- or model-influenced URL (cloud metadata endpoints and local aliases
// ported from the retired `url-safety.ts`).
const BLOCKED_HOSTNAMES = new Set([
  'localhost.localdomain',
  'metadata.google.internal',
  'instance-data.ec2.internal',
]);

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    BLOCKED_HOSTNAMES.has(host)
  ) {
    return true;
  }
  if (isIpv4(host)) return isPrivateIpv4(host);
  if (isIpv6(host)) {
    // NAT64 (`64:ff9b::/96`) embeds an IPv4 address that the platform may
    // route to; block the whole translation prefix.
    if (host === '::' || host === '::1' || host.startsWith('64:ff9b:')) return true;
    const mappedV4 = mappedIpv4FromIpv6(host);
    if (mappedV4) return isPrivateIpv4(mappedV4);
    return (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb')
    );
  }
  return false;
}

export function assertSafeOutboundUrl(
  value: string | URL,
  options: { protocols?: readonly string[]; hosts?: readonly string[] } = {},
): URL {
  const url = typeof value === 'string' ? new URL(value) : new URL(value.toString());
  const protocols = options.protocols ?? ['https:'];
  if (!protocols.includes(url.protocol)) throw new Error('outbound URL protocol is not allowed');
  if (url.username || url.password) throw new Error('outbound URL must not contain credentials');
  if (isPrivateHostname(url.hostname))
    throw new Error('outbound URL resolves to a private or reserved address');
  if (options.hosts && !options.hosts.includes(url.hostname.toLowerCase()))
    throw new Error('outbound URL host is not allowlisted');
  return url;
}

export function isSafeOutboundUrl(
  value: string | URL,
  options: { protocols?: readonly string[]; hosts?: readonly string[] } = {},
): boolean {
  try {
    assertSafeOutboundUrl(value, options);
    return true;
  } catch {
    return false;
  }
}
