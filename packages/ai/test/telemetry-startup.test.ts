import { beforeEach, describe, expect, it } from 'vitest';

import {
  getTelemetryStartupCheck,
  resetTelemetryStartupCheck,
  validateTelemetryStartup,
} from '../src/mastra-v2/shared/telemetry-startup';

describe('telemetry startup health', () => {
  beforeEach(() => resetTelemetryStartupCheck());

  it('reports healthy when no runtime exporter failure is known', () => {
    const result = validateTelemetryStartup({
      LANGFUSE_PUBLIC_KEY: 'public',
      LANGFUSE_SECRET_KEY: 'secret',
      LANGFUSE_BASE_URL: 'https://langfuse.example',
    });
    expect(result.status).toBe('healthy');
    expect(result.exporters.langfuse).toBe('configured');
    expect(getTelemetryStartupCheck()).toEqual(result);
  });

  it('reports Langfuse as disabled when it is not configured', () => {
    const result = validateTelemetryStartup({});
    expect(result.status).toBe('healthy');
    expect(result.exporters.langfuse).toBe('disabled');
  });

  it('reports database, metrics, langfuse, and mastra as configured when env vars are present', () => {
    const result = validateTelemetryStartup({
      DATABASE_URL: 'postgres://localhost:5432/kestrel',
      GRAFANA_CLOUD_OTLP_ENDPOINT: 'https://otlp.grafana.net/otlp',
      GRAFANA_CLOUD_API_KEY: 'glc_123',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-123',
      LANGFUSE_SECRET_KEY: 'sk-lf-123',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
    });
    expect(result.exporters).toEqual({
      database: 'configured',
      metrics: 'configured',
      langfuse: 'configured',
      mastra: 'configured',
    });
  });

  it('reports disabled when optional exporter env vars are absent', () => {
    const result = validateTelemetryStartup({});
    expect(result.exporters.database).toBe('disabled');
    expect(result.exporters.metrics).toBe('disabled');
    expect(result.exporters.langfuse).toBe('disabled');
    expect(result.exporters.mastra).toBe('disabled');
  });

  it('reports metrics configured when only the Prometheus remote-write transport is configured', () => {
    const result = validateTelemetryStartup({
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://metrics.example/api/prom/push',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: '3508468',
      GRAFANA_CLOUD_API_KEY: 'glc_x',
    });
    expect(result.exporters.metrics).toBe('configured');
  });

  it('reports mastra configured when either the database or Langfuse is available', () => {
    const withDatabaseOnly = validateTelemetryStartup({
      POSTGRES_URL: 'postgres://localhost:5432/kestrel',
    });
    expect(withDatabaseOnly.exporters.database).toBe('configured');
    expect(withDatabaseOnly.exporters.mastra).toBe('configured');
  });
});
