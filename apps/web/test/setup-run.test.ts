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

import {
  diagnoseComposeError,
  findFreePort,
  isPortInUse,
} from '../../../scripts/setup/lib/run.mjs';

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

describe('diagnoseComposeError', () => {
  it('identifies a port conflict and names the exact port', () => {
    const result = diagnoseComposeError(
      'Error response from daemon: failed to set up container networking: driver failed ' +
        'programming external connectivity on endpoint hamafx-ai-db-1: ' +
        'Bind for 0.0.0.0:5432 failed: port is already allocated',
    );
    expect(result?.title).toBe('Port conflict');
    expect(result?.summary).toContain('5432');
    expect(result?.fixes.join(' ')).toContain('ss -ltnp | grep :5432');
  });

  it('matches a port conflict without the Bind context', () => {
    const result = diagnoseComposeError('port is already allocated');
    expect(result?.title).toBe('Port conflict');
  });

  it('explains when the Docker daemon is unreachable', () => {
    const result = diagnoseComposeError(
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
    );
    expect(result?.title).toBe('Docker is not running');
    expect(result?.fixes.join(' ')).toContain('sudo systemctl start docker');
  });

  it('explains a docker permission problem', () => {
    const result = diagnoseComposeError('permission denied while trying to connect to the Docker daemon socket');
    expect(result?.title).toBe('Docker permission denied');
    expect(result?.fixes.join(' ')).toContain('usermod -aG docker');
  });

  it('explains a full disk', () => {
    const result = diagnoseComposeError('#26 ERROR: failed to solve: no space left on device');
    expect(result?.title).toBe('Disk full');
    expect(result?.fixes.join(' ')).toContain('docker system prune -a');
  });

  it('explains a network interruption', () => {
    const result = diagnoseComposeError('failed to fetch https://registry.npmjs.org: i/o timeout');
    expect(result?.title).toBe('Network error');
  });

  it('returns null for unrecognized output', () => {
    expect(diagnoseComposeError('some unrelated error')).toBeNull();
    expect(diagnoseComposeError('')).toBeNull();
  });

  it('ignores ANSI color codes in the output', () => {
    const result = diagnoseComposeError('\u001b[31mBind for 0.0.0.0:5432 failed: port is already allocated\u001b[0m');
    expect(result?.title).toBe('Port conflict');
  });
});
