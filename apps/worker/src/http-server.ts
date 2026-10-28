import * as http from 'http';
import { timingSafeEqual } from 'node:crypto';

import { assertSafeOutboundUrl, getCapabilityReport } from '@kestrel/shared';

import type { Logger } from './log.js';

export interface HealthServerDeps {
  log: Logger;
  getLastTickAt: () => number;
  isSignalRConnected: () => boolean;
  isBinanceConnected?: () => boolean;
  /** Whether the legacy 24/7 tick streaming pipeline is enabled (defaults to true for legacy callers). */
  isTickStreamEnabled?: () => boolean;
  getDroppedTicks?: () => number;
  isProxyConfigured?: () => boolean;
  getRequestId?: () => string;
  /**
   * Jobs that have overrun their scheduler budget. A wedged job holds its
   * in-flight guard until its promise settles, which can block the job
   * forever; reporting it here makes readiness fail so the container
   * healthcheck trips and the autoheal loop restarts the process.
   */
  getStuckJobs?: () => Array<{ name: string; stuckForMs: number }>;
}

export interface WorkerHttpServers {
  health: http.Server;
  proxy: http.Server;
}

function sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function verifyBearerToken(headerValue: string | undefined, expectedToken: string): boolean {
  const provided = Buffer.from(headerValue ?? '');
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function createHealthHandler(deps: HealthServerDeps): http.RequestListener {
  const { getLastTickAt, isSignalRConnected } = deps;
  const healthToken = process.env.WORKER_HEALTH_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  function hasValidToken(req: http.IncomingMessage): boolean {
    if (!healthToken) return !isProd;
    return verifyBearerToken(req.headers.authorization, healthToken);
  }

  return (req, res) => {
    if (
      req.url !== '/' &&
      req.url !== '/health' &&
      req.url !== '/api/health' &&
      req.url !== '/health/live' &&
      req.url !== '/health/ready' &&
      req.url !== '/health/jobs' &&
      req.url !== '/health/dependencies'
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!hasValidToken(req)) {
      sendJson(res, healthToken ? 401 : 503, { status: 'unauthorized' });
      return;
    }

    const liveOnly = req.url === '/health/live';
    const dependenciesOnly = req.url === '/health/dependencies';
    const jobsOnly = req.url === '/health/jobs';
    const tickStreamEnabled = deps.isTickStreamEnabled?.() ?? true;
    const lastTickAt = getLastTickAt();
    const ageMs = lastTickAt > 0 ? Date.now() - lastTickAt : null;
    const feedReady =
      !tickStreamEnabled ||
      (lastTickAt > 0 && ageMs !== null && ageMs < 120_000 && isSignalRConnected());
    // A job wedged past its budget holds its in-flight guard forever (the
    // scheduler only releases it when the promise settles), so every future
    // run of that job is skipped. `/health/jobs` exposes exactly that signal
    // so the container healthcheck can fail without also depending on tick
    // freshness, and the VM autoheal loop can restart the process.
    const stuckJobs = deps.getStuckJobs?.() ?? [];
    const jobsHealthy = stuckJobs.length === 0;
    const jobsBody = {
      jobsHealthy,
      stuckJobs,
      oldestStuckJobMs:
        stuckJobs.length > 0
          ? stuckJobs.reduce((max, job) => Math.max(max, job.stuckForMs), 0)
          : null,
    };
    const ready = feedReady && jobsHealthy;
    const healthy = liveOnly || dependenciesOnly || (jobsOnly ? jobsHealthy : ready);
    sendJson(res, healthy ? 200 : 503, {
      status: liveOnly || dependenciesOnly ? 'ok' : healthy ? 'ok' : 'degraded',
      ...(liveOnly
        ? { live: true }
        : dependenciesOnly
          ? { capabilities: getCapabilityReport(process.env) }
          : jobsOnly
            ? jobsBody
            : {
                ready,
                ...jobsBody,
                tickStreamEnabled,
                lastTickAgeMs: ageMs,
                signalrConnected: isSignalRConnected(),
                ...(deps.isBinanceConnected ? { binanceConnected: deps.isBinanceConnected() } : {}),
                droppedTicks: deps.getDroppedTicks?.() ?? 0,
                proxyConfigured:
                  deps.isProxyConfigured?.() ?? Boolean(process.env.BIQUOTE_PROXY_TOKEN),
                capabilities: getCapabilityReport(process.env),
              }),
      uptimeMs: process.uptime() * 1000,
    });
  };
}

function createProxyHandler(deps: HealthServerDeps): http.RequestListener {
  const baseUrl = process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
  const proxyToken = process.env.BIQUOTE_PROXY_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  return async (req, res) => {
    if (!req.url?.startsWith('/biquote')) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!proxyToken && isProd) {
      res.writeHead(503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Retry-After': '86400',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(
        JSON.stringify({
          status: 'error',
          message: 'BiQuote proxy not configured',
          ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
        }),
      );
      return;
    }
    if (proxyToken && !verifyBearerToken(req.headers.authorization, proxyToken)) {
      sendJson(res, 403, {
        status: 'error',
        message: 'forbidden',
        ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, {
        status: 'error',
        message: 'method not allowed',
        ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
      });
      return;
    }

    let target: URL | undefined;
    try {
      const base = assertSafeOutboundUrl(baseUrl, { protocols: ['https:'] });
      target = assertSafeOutboundUrl(new URL(req.url.slice('/biquote'.length) || '/', base), {
        protocols: ['https:'],
        hosts: [base.hostname],
      });
      const upstream = await fetch(target, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      });
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(await upstream.text());
    } catch (err) {
      deps.log.error('biquote-proxy error', {
        target: target?.hostname ?? 'invalid',
        err: String(err),
      });
      sendJson(res, 502, {
        status: 'error',
        message: 'BiQuote upstream request failed',
        ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
      });
    }
  };
}

export function createHealthServer(deps: HealthServerDeps): http.Server {
  return http.createServer(createHealthHandler(deps));
}

export function createProxyServer(deps: HealthServerDeps): http.Server {
  return http.createServer(createProxyHandler(deps));
}

export function createWorkerHttpServers(deps: HealthServerDeps): WorkerHttpServers {
  return { health: createHealthServer(deps), proxy: createProxyServer(deps) };
}
