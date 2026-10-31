/**
 * Copyright 2026 Kestrel
 * Licensed under the Apache License, Version 2.0.
 */

import { metrics } from '@kestrel/shared';
import {
  grafanaOtlpConfigFromEnv,
  grafanaRemoteWriteConfigFromEnv,
} from '@kestrel/shared/metrics-export';

import { isMastraTelemetryDegraded } from './run-telemetry';

export type TelemetryStartupStatus = 'healthy' | 'degraded';

export interface TelemetryStartupCheck {
  status: TelemetryStartupStatus;
  checkedAt: string;
  exporters: {
    // 'unknown' is retained in the union for backward compatibility with
    // older consumers decoding persisted checks; live checks always report
    // 'configured' or 'disabled' from real env readiness.
    database: 'configured' | 'disabled' | 'unknown';
    metrics: 'configured' | 'disabled' | 'unknown';
    langfuse: 'configured' | 'disabled' | 'unknown';
    mastra: 'configured' | 'disabled' | 'unknown';
  };
  failures: string[];
}

let lastCheck: TelemetryStartupCheck | null = null;
let previousStatus: TelemetryStartupStatus | null = null;

export function validateTelemetryStartup(
  env: NodeJS.ProcessEnv = process.env,
): TelemetryStartupCheck {
  const failures: string[] = [];
  // Phase 1 (observability roadmap) — report real exporter readiness instead
  // of hardcoding 'unknown' for the DB, metrics, and Mastra surfaces.
  const databaseConfigured = Boolean(env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim());
  const metricsConfigured = Boolean(
    grafanaOtlpConfigFromEnv(env) || grafanaRemoteWriteConfigFromEnv(env),
  );
  const langfuseConfigured = Boolean(
    env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL,
  );
  // Mastra traces land in Langfuse when configured and in the durable DB
  // telemetry otherwise — either sink is enough to call the surface ready.
  const mastraConfigured = databaseConfigured || langfuseConfigured;
  const degraded = isMastraTelemetryDegraded();
  if (degraded) failures.push('one or more telemetry exporters reported a runtime failure');

  const check: TelemetryStartupCheck = {
    status: failures.length === 0 ? 'healthy' : 'degraded',
    checkedAt: new Date().toISOString(),
    exporters: {
      database: databaseConfigured ? 'configured' : 'disabled',
      metrics: metricsConfigured ? 'configured' : 'disabled',
      langfuse: langfuseConfigured ? 'configured' : 'disabled',
      mastra: mastraConfigured ? 'configured' : 'disabled',
    },
    failures,
  };

  if (previousStatus === 'healthy' && check.status === 'degraded') {
    metrics.increment('mastra_telemetry_degraded_total');
  }
  previousStatus = check.status;
  lastCheck = check;
  return check;
}

export function getTelemetryStartupCheck(): TelemetryStartupCheck | null {
  return lastCheck;
}

export function resetTelemetryStartupCheck(): void {
  lastCheck = null;
  previousStatus = null;
}
