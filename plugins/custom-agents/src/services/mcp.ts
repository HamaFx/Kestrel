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

// Remote MCP bridge for user-authored agents.
//
// URLs are user input and therefore an SSRF boundary. HTTPS is required
// except for loopback hosts; private/link-local hosts are denied unless the
// operator opts in (`MCP_ALLOW_PRIVATE_HOSTS=1`, `MCP_ALLOW_INSECURE_URLS=1`).
// Authorization headers are encrypted at rest with the shared Kestrel cipher
// and decrypted only inside the catalog runtime.

import { PLUGIN_SECRET_PREFIX } from '@kestrel/plugin-sdk/settings';
import { decryptSecret, encryptSecret } from '@kestrel/shared/encryption';
import { MCPClient } from '@mastra/mcp';

import type { StoredMcpServer } from '../db/tables';
import type { McpServerInput } from '../schemas';

export class McpConfigError extends Error {
  readonly code = 'MCP_CONFIG_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'McpConfigError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return true;
  }
  // IPv4 private / link-local / CGNAT ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  // IPv6 unique-local / link-local.
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}

export function validateMcpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpConfigError('MCP server URL is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new McpConfigError('MCP server URL must use https:// (http:// is loopback-only).');
  }
  if (url.username || url.password) {
    throw new McpConfigError('MCP server URL must not embed credentials. Use the token field.');
  }
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    if (!envFlag('MCP_ALLOW_INSECURE_URLS')) {
      throw new McpConfigError(
        'MCP server URL must use https://. Set MCP_ALLOW_INSECURE_URLS=1 to allow plain HTTP for trusted internal hosts.',
      );
    }
  }
  if (isPrivateHostname(url.hostname) && !envFlag('MCP_ALLOW_PRIVATE_HOSTS')) {
    throw new McpConfigError(
      'MCP server URLs may not target private or loopback hosts unless the operator sets MCP_ALLOW_PRIVATE_HOSTS=1.',
    );
  }
  return url;
}

function existingAuth(existing: readonly StoredMcpServer[], id: string): string | undefined {
  return existing.find((server) => server.id === id)?.authorization;
}

/**
 * Merge submitted MCP definitions into the stored encrypted form.
 *
 * `authorization` semantics on update: omitted preserves the current token;
 * `''` removes it; any other value is encrypted.
 */
export function prepareMcpServers(
  input: readonly McpServerInput[],
  existing: readonly StoredMcpServer[] = [],
): StoredMcpServer[] {
  const seen = new Set<string>();
  const result: StoredMcpServer[] = [];
  for (const server of input) {
    if (seen.has(server.id)) {
      throw new McpConfigError(`MCP server id "${server.id}" is duplicated.`);
    }
    seen.add(server.id);
    const url = validateMcpUrl(server.url);
    const auth = server.authorization;
    let authorization: string | undefined;
    if (auth === '') {
      authorization = undefined;
    } else if (auth === undefined) {
      authorization = existingAuth(existing, server.id);
    } else if (auth.startsWith(PLUGIN_SECRET_PREFIX)) {
      authorization = auth;
    } else {
      authorization = `${PLUGIN_SECRET_PREFIX}${encryptSecret(auth.trim())}`;
    }
    result.push({
      id: server.id,
      url: url.toString(),
      ...(authorization ? { authorization } : {}),
    });
  }
  return result;
}

export function decryptMcpServers(
  servers: readonly StoredMcpServer[],
): Array<{ id: string; url: string; authorization?: string }> {
  const result: Array<{ id: string; url: string; authorization?: string }> = [];
  for (const server of servers) {
    if (typeof server?.url !== 'string' || typeof server?.id !== 'string') continue;
    let authorization: string | undefined;
    if (server.authorization?.startsWith(PLUGIN_SECRET_PREFIX)) {
      const decrypted = decryptSecret(server.authorization.slice(PLUGIN_SECRET_PREFIX.length));
      if (decrypted === null) continue;
      authorization = decrypted;
    } else if (server.authorization) {
      authorization = server.authorization;
    }
    result.push({
      id: server.id,
      url: server.url,
      ...(authorization ? { authorization } : {}),
    });
  }
  return result;
}

/**
 * Resolve tools from every configured MCP server. Returns `{}` on any failure:
 * a flaky third-party server must not break a chat turn.
 */
export async function resolveMcpTools(args: {
  servers: readonly StoredMcpServer[];
  signal?: AbortSignal;
  logger?: { warn(message: string, fields?: Record<string, unknown>): void };
}): Promise<Record<string, unknown>> {
  const decrypted = decryptMcpServers(args.servers);
  if (decrypted.length === 0) return {};

  const servers: Record<string, { url: URL; requestInit?: RequestInit; allowedHosts: string[] }> =
    {};
  for (const server of decrypted) {
    try {
      const url = validateMcpUrl(server.url);
      servers[server.id] = {
        url,
        // Pin redirects to the validated host so an MCP server cannot bounce
        // the client to an internal address after the URL check.
        allowedHosts: [url.host],
        ...(server.authorization
          ? { requestInit: { headers: { Authorization: server.authorization } } }
          : {}),
      };
    } catch (err) {
      args.logger?.warn('MCP server skipped: invalid URL', {
        id: server.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (Object.keys(servers).length === 0) return {};

  const client = new MCPClient({ servers, timeout: 15_000 });
  try {
    return (await client.listTools()) as Record<string, unknown>;
  } catch (err) {
    args.logger?.warn('MCP tool discovery failed; continuing without MCP tools', {
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}
