/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHealthServer, createProxyServer } from '../src/http-server';

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

async function request(
  server: ReturnType<typeof createHealthServer>,
  path: string,
  init?: RequestInit,
) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

afterEach(() => {
  delete process.env.WORKER_HEALTH_TOKEN;
  delete process.env.BIQUOTE_PROXY_TOKEN;
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

  it('reports ready=true in on-demand mode when tick streaming is disabled', async () => {
    const server = createHealthServer({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
      getLastTickAt: () => 0,
      isSignalRConnected: () => false,
      isTickStreamEnabled: () => false,
    });
    const response = await request(server, '/health/ready');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      ready: true,
      tickStreamEnabled: false,
      lastTickAgeMs: null,
    });
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

  it('requires the health token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WORKER_HEALTH_TOKEN = 'health-secret';

    const unauthorized = await request(createServer(Date.now(), true), '/health/live');
    expect(unauthorized.status).toBe(401);

    const authorized = await request(createServer(Date.now(), true), '/health/live', {
      headers: { authorization: 'Bearer health-secret' },
    });
    expect(authorized.status).toBe(200);
  });

  it('rejects an unconfigured production BiQuote proxy without exposing internals', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BIQUOTE_PROXY_TOKEN;

    const response = await request(
      createProxyServer({
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
        getLastTickAt: () => Date.now(),
        isSignalRConnected: () => true,
      }),
      '/biquote/api/XAUUSD/ohlc',
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: 'error',
      message: 'BiQuote proxy not configured',
    });
  });

  it('keeps /health as a readiness-compatible alias', async () => {
    const response = await request(createServer(Date.now(), true), '/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', ready: true });
  });

  it('reports no wedged jobs on a healthy worker', async () => {
    const response = await request(createServer(Date.now(), true), '/health/jobs');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      jobsHealthy: true,
      stuckJobs: [],
      oldestStuckJobMs: null,
    });
  });

  it('fails /health/jobs and readiness when a scheduled job is wedged', async () => {
    const wedged = createHealthServer({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
      getLastTickAt: () => 0,
      isSignalRConnected: () => false,
      isTickStreamEnabled: () => false,
      getStuckJobs: () => [{ name: 'multi-agent-analysis', stuckForMs: 1_260_000 }],
    });

    const jobs = await request(wedged, '/health/jobs');
    expect(jobs.status).toBe(503);
    await expect(jobs.json()).resolves.toMatchObject({
      status: 'degraded',
      jobsHealthy: false,
      stuckJobs: [{ name: 'multi-agent-analysis', stuckForMs: 1_260_000 }],
      oldestStuckJobMs: 1_260_000,
    });

    // Readiness folds the wedged job in, so orchestrators and the
    // production verifier see the worker as unavailable for new work.
    const ready = await request(wedged, '/health');
    expect(ready.status).toBe(503);
    await expect(ready.json()).resolves.toMatchObject({ ready: false, jobsHealthy: false });

    // Liveness stays green: the process answers, the autoheal probe decides.
    const live = await request(wedged, '/health/live');
    expect(live.status).toBe(200);
  });

  it('does not expose an unauthenticated catch-all route on the health listener', async () => {
    const response = await request(createServer(Date.now(), true), '/internal');
    expect(response.status).toBe(404);
  });

  it('rejects non-GET/HEAD requests on the BiQuote proxy with 405', async () => {
    process.env.BIQUOTE_PROXY_TOKEN = 'secret-token';
    const proxy = createProxyServer({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
      getLastTickAt: () => Date.now(),
      isSignalRConnected: () => true,
    });
    const response = await request(proxy, '/biquote/api/XAUUSD', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(response.status).toBe(405);
  });
});
