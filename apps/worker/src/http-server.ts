import * as http from 'http';
import { timingSafeEqual } from 'node:crypto';

import { assertSafeOutboundUrl, getCapabilityReport } from '@kestrel/shared';

import type { Logger } from './log.js';

export interface HealthServerDeps {
  log: Logger;
  getLastTickAt: () => number;
  isSignalRConnected: () => boolean;
  getDroppedTicks?: () => number;
  isProxyConfigured?: () => boolean;
  getRequestId?: () => string;
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

function createHealthHandler(deps: HealthServerDeps): http.RequestListener {
  const { getLastTickAt, isSignalRConnected } = deps;
  const healthToken = process.env.WORKER_HEALTH_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  function hasValidToken(req: http.IncomingMessage): boolean {
    if (!healthToken) return !isProd;
    const provided = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${healthToken}`);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  return (req, res) => {
    if (
      req.url !== '/' &&
      req.url !== '/health' &&
      req.url !== '/api/health' &&
      req.url !== '/health/live' &&
      req.url !== '/health/ready' &&
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
    const ageMs = Date.now() - getLastTickAt();
    const ready = getLastTickAt() > 0 && ageMs < 120_000 && isSignalRConnected();
    const healthy = liveOnly || dependenciesOnly || ready;
    sendJson(res, healthy ? 200 : 503, {
      status: liveOnly || dependenciesOnly ? 'ok' : ready ? 'ok' : 'degraded',
      ...(liveOnly
        ? { live: true }
        : dependenciesOnly
          ? { capabilities: getCapabilityReport(process.env) }
          : {
              ready,
              lastTickAgeMs: ageMs,
              signalrConnected: isSignalRConnected(),
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
    if (proxyToken && req.headers.authorization !== `Bearer ${proxyToken}`) {
      sendJson(res, 403, {
        status: 'error',
        message: 'forbidden',
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
