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

import { PLUGIN_SECRET_PREFIX } from '@kestrel/plugin-sdk/settings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptMcpServers,
  McpConfigError,
  prepareMcpServers,
  validateMcpUrl,
} from '../src/services/mcp';

describe('MCP URL boundary', () => {
  const originalPrivate = process.env.MCP_ALLOW_PRIVATE_HOSTS;
  const originalInsecure = process.env.MCP_ALLOW_INSECURE_URLS;

  beforeEach(() => {
    delete process.env.MCP_ALLOW_PRIVATE_HOSTS;
    delete process.env.MCP_ALLOW_INSECURE_URLS;
  });

  afterEach(() => {
    if (originalPrivate === undefined) delete process.env.MCP_ALLOW_PRIVATE_HOSTS;
    else process.env.MCP_ALLOW_PRIVATE_HOSTS = originalPrivate;
    if (originalInsecure === undefined) delete process.env.MCP_ALLOW_INSECURE_URLS;
    else process.env.MCP_ALLOW_INSECURE_URLS = originalInsecure;
  });

  it('accepts public HTTPS endpoints', () => {
    expect(validateMcpUrl('https://mcp.example.com/mcp').host).toBe('mcp.example.com');
  });

  it('rejects plain HTTP, embedded credentials and non-HTTP schemes', () => {
    expect(() => validateMcpUrl('http://mcp.example.com/mcp')).toThrow(McpConfigError);
    expect(() => validateMcpUrl('https://user:pass@mcp.example.com/mcp')).toThrow(McpConfigError);
    expect(() => validateMcpUrl('file:///etc/passwd')).toThrow(McpConfigError);
  });

  it('blocks private and loopback hosts by default', () => {
    for (const url of [
      'https://127.0.0.1/mcp',
      'https://192.168.1.10/mcp',
      'https://10.0.0.5/mcp',
      'https://[::1]/mcp',
      'https://mcp.internal/mcp',
    ]) {
      expect(() => validateMcpUrl(url)).toThrow(McpConfigError);
    }
  });

  it('allows loopback HTTP only with the operator opt-ins', () => {
    process.env.MCP_ALLOW_PRIVATE_HOSTS = '1';
    expect(validateMcpUrl('http://localhost:8787/mcp').host).toBe('localhost:8787');
  });
});

describe('MCP authorization storage', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_SECRET = 'b'.repeat(64);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_SECRET;
  });

  it('encrypts the token at rest and decrypts it for the runtime', () => {
    const stored = prepareMcpServers([
      { id: 'market', url: 'https://mcp.example.com/mcp', authorization: 'Bearer secret' },
    ]);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.authorization?.startsWith(PLUGIN_SECRET_PREFIX)).toBe(true);
    expect(stored[0]?.authorization).not.toContain('Bearer secret');
    expect(decryptMcpServers(stored)[0]?.authorization).toBe('Bearer secret');
  });

  it('preserves a stored token when the update omits it, and clears on empty', () => {
    const stored = prepareMcpServers([
      { id: 'market', url: 'https://mcp.example.com/mcp', authorization: 'Bearer first' },
    ]);
    const preserved = prepareMcpServers(
      [{ id: 'market', url: 'https://mcp.example.com/mcp' }],
      stored,
    );
    expect(decryptMcpServers(preserved)[0]?.authorization).toBe('Bearer first');

    const cleared = prepareMcpServers(
      [{ id: 'market', url: 'https://mcp.example.com/mcp', authorization: '' }],
      preserved,
    );
    expect(cleared[0]?.authorization).toBeUndefined();
  });

  it('rejects duplicate server ids', () => {
    expect(() =>
      prepareMcpServers([
        { id: 'market', url: 'https://a.example.com/mcp' },
        { id: 'market', url: 'https://b.example.com/mcp' },
      ]),
    ).toThrow(McpConfigError);
  });
});
