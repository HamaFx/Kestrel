/**
 * Copyright 2026 Kestrel
 * SPDX-License-Identifier: Apache-2.0
 */

const PRIVATE_IPV4 = [
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

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (isIpv4(host)) return isPrivateIpv4(host);
  if (isIpv6(host)) {
    return (
      host === '::1' ||
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
