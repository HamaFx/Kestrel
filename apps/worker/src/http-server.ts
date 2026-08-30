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

// Worker HTTP server — health checks + BiQuote REST proxy for Vercel.
//
// The proxy lets Vercel serverless functions reach BiQuote through this
// worker VM when BiQuote is unreachable from the Vercel network.
//
// SECURITY: the caller should bind this server to localhost or a private
// interface. Do not expose the health/proxy port publicly without a firewall
// and WORKER_HEALTH_TOKEN.
// The BiQuote proxy requires bearer-token auth when BIQUOTE_PROXY_TOKEN is set.
// PR-11: In production, a missing BIQUOTE_PROXY_TOKEN makes proxy requests
// return 503 (Service Unavailable) rather than 500 — the proxy is an
// optional pathway; its absence should be a soft degradation, not a
// hard error that would trigger Sentry alerts on every proxy request.

import * as http from 'http';
import { timingSafeEqual } from 'node:crypto';

import { assertSafeOutboundUrl, getCapabilityReport } from '@kestrel/shared';

import type { Logger } from './log.js';

export interface HealthServerDeps {
  log: Logger;
  /** Returns the epoch ms of the last tick (0 if none received yet). */
  getLastTickAt: () => number;
  /** Returns whether the SignalR consumer is connected. */
  isSignalRConnected: () => boolean;
  /** H4 fix — count of ticks dropped due to onTick handler errors. */
  getDroppedTicks?: () => number;
  /** PR-11 — whether the BiQuote proxy has a valid token configured. */
  isProxyConfigured?: () => boolean;
}

/**
 * Create the HTTP server for health checks and BiQuote REST proxy.
 * Caller must call `server.listen()` with the desired container bind address.
 */
export function createHealthServer(deps: HealthServerDeps): http.Server {
  const { log, getLastTickAt, isSignalRConnected } = deps;
  const BIQUOTE_BASE = process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
  const PROXY_TOKEN = process.env.BIQUOTE_PROXY_TOKEN;
  const HEALTH_TOKEN = process.env.WORKER_HEALTH_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  function hasValidHealthToken(req: http.IncomingMessage): boolean {
    // Development keeps the localhost health check convenient. Production
    // requires a bearer token because this endpoint is reachable externally.
    if (!HEALTH_TOKEN) return !isProd;
    const provided = req.headers.authorization ?? '';
    const expected = `Bearer ${HEALTH_TOKEN}`;
    const providedBytes = Buffer.from(provided);
    const expectedBytes = Buffer.from(expected);
    return (
      providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
    );
  }

  // H-3: BIQUOTE_PROXY_TOKEN is required in production. Without it,
  // the proxy is wide open to anyone who can reach port 8081 (even
  // though it's bound to 127.0.0.1, local processes could abuse it).
  // PR-11: Downgraded from error to warn — a missing proxy token is a
  // configuration gap, not a server crash. The proxy returns 503 for
  // all requests when unconfigured; the health endpoint still works.
  if (isProd && !PROXY_TOKEN) {
    log.warn('BIQUOTE_PROXY_TOKEN is not set — BiQuote proxy will reject all requests');
  }

  return http.createServer(async (req, res) => {
    // BiQuote proxy: /biquote/api/XAUUSD/ohlc?interval=60&limit=100
    if (req.url?.startsWith('/biquote')) {
      // H-3: Require bearer-token auth in production.
      // In production the proxy always requires a valid token.
      // In dev, the token is optional for convenience.
      if (PROXY_TOKEN) {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${PROXY_TOKEN}`) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'forbidden' }));
          return;
        }
      } else if (isProd) {
        // No token configured in production — reject all requests.
        // PR-11: Return 503 (Service Unavailable) rather than 500.
        // A missing proxy token is a configuration issue, not a server
        // error. Retry-After is set to a large value so clients don't
        // hammer the endpoint when the proxy is permanently unconfigured.
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Retry-After': '86400',
        });
        res.end(
          JSON.stringify({
            status: 'error',
            message: 'BiQuote proxy not configured (missing BIQUOTE_PROXY_TOKEN)',
          }),
        );
        return;
      }
      const rest = req.url.slice('/biquote'.length) || '/';
      let target: URL | undefined;
      try {
        const base = assertSafeOutboundUrl(BIQUOTE_BASE, { protocols: ['https:'] });
        target = assertSafeOutboundUrl(new URL(rest, base), {
          protocols: ['https:'],
          hosts: [base.hostname],
        });
        const targetRes = await fetch(target, {
          signal: AbortSignal.timeout(10_000),
          headers: { accept: 'application/json' },
        });
        const body = await targetRes.text();
        res.writeHead(targetRes.status, {
          'Content-Type': targetRes.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch (err) {
        log.error('biquote-proxy error', { target: target?.hostname ?? 'invalid', err: String(err) });
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: String(err) }));
      }
      return;
    }
    // Health endpoints — `/health` and `/api/health` remain compatibility
    // aliases. `/health/live` is process liveness only; `/health/ready`
    // reports feed readiness for orchestrators and uptime checks.
    if (
      req.url === '/health' ||
      req.url === '/api/health' ||
      req.url === '/' ||
      req.url === '/health/live' ||
      req.url === '/health/ready' ||
      req.url === '/health/dependencies'
    ) {
      if (!hasValidHealthToken(req)) {
        res.writeHead(HEALTH_TOKEN ? 401 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unauthorized' }));
        return;
      }
      const liveOnly = req.url === '/health/live';
      const dependenciesOnly = req.url === '/health/dependencies';
      const lastTickAt = getLastTickAt();
      const ageMs = Date.now() - lastTickAt;
      const ready = lastTickAt > 0 && ageMs < 120_000 && isSignalRConnected();
      const capabilityReport = getCapabilityReport(process.env);
      const healthy = liveOnly || dependenciesOnly || ready;
      res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: liveOnly || dependenciesOnly ? 'ok' : ready ? 'ok' : 'degraded',
          ...(liveOnly
            ? { live: true }
            : dependenciesOnly
              ? { capabilities: capabilityReport }
              : {
                  ready,
                  lastTickAgeMs: ageMs,
                  signalrConnected: isSignalRConnected(),
                  droppedTicks: deps.getDroppedTicks?.() ?? 0,
                  proxyConfigured: deps.isProxyConfigured?.() ?? Boolean(PROXY_TOKEN),
                  capabilities: capabilityReport,
                }),
          uptimeMs: process.uptime() * 1000,
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}
