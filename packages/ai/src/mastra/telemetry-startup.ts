/**
 * Copyright 2026 Kestrel
 * Licensed under the Apache License, Version 2.0.
 */

import { metrics } from '@kestrel/shared';

import { isMastraTelemetryDegraded } from './run-telemetry';

export type TelemetryStartupStatus = 'healthy' | 'degraded';

export interface TelemetryStartupCheck {
  status: TelemetryStartupStatus;
  checkedAt: string;
  exporters: {
    database: 'configured' | 'unknown';
    metrics: 'configured' | 'unknown';
    langfuse: 'configured' | 'disabled';
    mastra: 'configured' | 'unknown';
  };
  failures: string[];
}

let lastCheck: TelemetryStartupCheck | null = null;
let previousStatus: TelemetryStartupStatus | null = null;

export function validateTelemetryStartup(env: NodeJS.ProcessEnv = process.env): TelemetryStartupCheck {
  const failures: string[] = [];
  const langfuseConfigured = Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL);
  const degraded = isMastraTelemetryDegraded();
  if (degraded) failures.push('one or more telemetry exporters reported a runtime failure');

  const check: TelemetryStartupCheck = {
    status: failures.length === 0 ? 'healthy' : 'degraded',
    checkedAt: new Date().toISOString(),
    exporters: {
      database: 'unknown',
      metrics: 'unknown',
      langfuse: langfuseConfigured ? 'configured' : 'disabled',
      mastra: 'unknown',
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
