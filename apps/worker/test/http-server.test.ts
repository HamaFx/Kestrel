/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHealthServer } from '../src/http-server';

function createServer(lastTickAt: number, connected: boolean) {
  return createHealthServer({
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      with: vi.fn(),
    },
    getLastTickAt: () => lastTickAt,
    isSignalRConnected: () => connected,
  });
}

async function request(server: ReturnType<typeof createHealthServer>, path: string) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

afterEach(() => {
  delete process.env.WORKER_HEALTH_TOKEN;
  delete process.env.NODE_ENV;
});

describe('worker health server', () => {
  it('returns liveness without requiring a recent market tick', async () => {
    const response = await request(createServer(0, false), '/health/live');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', live: true });
  });

  it('returns readiness only when the feed is connected and fresh', async () => {
    const response = await request(createServer(Date.now(), true), '/health/ready');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', ready: true });
  });

  it('returns degraded readiness when the feed is stale', async () => {
    const response = await request(createServer(Date.now() - 180_000, true), '/health/ready');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: 'degraded', ready: false });
  });

  it('exposes a redacted capability report for operators', async () => {
    const response = await request(createServer(Date.now(), true), '/health/dependencies');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.capabilities).toEqual(
      expect.objectContaining({
        enabled: expect.any(Array),
        disabled: expect.any(Array),
        capabilities: expect.arrayContaining([
          expect.objectContaining({ name: 'langfuse-prompt-output-capture', status: 'disabled' }),
        ]),
      }),
    );
  });

  it('keeps /health as a readiness-compatible alias', async () => {
    const response = await request(createServer(Date.now(), true), '/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', ready: true });
  });
});
