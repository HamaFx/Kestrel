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

import { createServer } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { findFreePort, isPortInUse } from '../../../scripts/setup/lib/run.mjs';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    await new Promise((resolvePromise) => server?.close(resolvePromise));
  }
});

/** Bind a TCP server on an ephemeral port and return { server, port }. */
function listen(port = 0): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      servers.push(server);
      resolvePromise({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

describe('isPortInUse', () => {
  it('reports true when a listener is bound to the port', async () => {
    const { port } = await listen();
    await expect(isPortInUse(port, '127.0.0.1')).resolves.toBe(true);
  });

  it('reports false for a port with no listener', async () => {
    // Bind, note the port, close — then nothing is listening there.
    const { server, port } = await listen();
    await new Promise((resolvePromise) => server.close(resolvePromise));
    servers.pop();
    await expect(isPortInUse(port, '127.0.0.1')).resolves.toBe(false);
  });
});

describe('findFreePort', () => {
  it('returns a port at or above start that can actually be bound', async () => {
    const free = await findFreePort(31000, '127.0.0.1');
    expect(free).not.toBeNull();
    // A freshly bound listener proves the returned port was free.
    const { port } = await listen(free as number);
    expect(port).toBe(free);
  });

  it('skips ports that are already in use', async () => {
    const { port } = await listen();
    const free = await findFreePort(port, '127.0.0.1');
    expect(free).not.toBeNull();
    expect(free).toBeGreaterThan(port);
  });
});
