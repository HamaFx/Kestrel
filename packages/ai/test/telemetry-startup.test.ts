import { beforeEach, describe, expect, it } from 'vitest';

import {
  getTelemetryStartupCheck,
  resetTelemetryStartupCheck,
  validateTelemetryStartup,
} from '../src/mastra/telemetry-startup';

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
});
