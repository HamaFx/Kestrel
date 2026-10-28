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

import type * as SharedLoggerModule from '@kestrel/shared/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MastraPinoLogger } from '../src/mastra-v2';

const logMocks = vi.hoisted(() => {
  const makeLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    with: vi.fn(() => makeLogger()),
  });
  return {
    logger: makeLogger(),
    logErrorContext: vi.fn(),
  };
});

vi.mock('@kestrel/shared/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof SharedLoggerModule>();
  return {
    ...actual,
    createCategorizedLogger: () => logMocks.logger,
    logErrorContext: logMocks.logErrorContext,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mastra-v2 MastraPinoLogger adapter', () => {
  it('forwards all levels without throwing', () => {
    const adapter = new MastraPinoLogger();
    expect(() => {
      adapter.debug('debug message');
      adapter.info('info message', { meta: 1 });
      adapter.warn('warn message', { runId: 'run-1' });
      adapter.error('error message', { err: 'detail' });
    }).not.toThrow();
  });

  it('tolerates primitive extra args and drops non-serializable values', () => {
    const adapter = new MastraPinoLogger();
    expect(() => {
      adapter.info('turn started', 'user-1', 42, true, { nested: { object: true } });
    }).not.toThrow();
  });

  it('records exceptions through logErrorContext without throwing', () => {
    const adapter = new MastraPinoLogger();
    expect(() => {
      adapter.trackException(new Error('mastra failure'), { runId: 'run-1' });
    }).not.toThrow();
    expect(logMocks.logErrorContext).toHaveBeenCalledTimes(1);
  });

  it('downgrades Mastra span-attribution lookup misses to debug', () => {
    const adapter = new MastraPinoLogger();

    // Committee agents and per-run scorers are intentionally not registered
    // on the shared Mastra instance; the trace pipeline probes those ids on
    // every run and routes the misses through trackException.
    adapter.trackException(new Error('Agent with id kestrel-mastra-decision not found'));
    adapter.trackException(new Error('Scorer with id kestrel-citation not found'));

    expect(logMocks.logErrorContext).not.toHaveBeenCalled();
    expect(logMocks.logger.debug).toHaveBeenCalledTimes(2);
  });

  it('keeps unrelated exceptions at error level', () => {
    const adapter = new MastraPinoLogger();
    adapter.trackException(new Error('Agent with id x not found, but something else broke'));

    expect(logMocks.logErrorContext).toHaveBeenCalledTimes(1);
  });

  it('exposes empty log surfaces (Kestrel owns log persistence)', async () => {
    const adapter = new MastraPinoLogger();
    expect(adapter.getTransports().size).toBe(0);
    await expect(adapter.listLogs('any', {})).resolves.toMatchObject({ total: 0 });
    await expect(adapter.listLogsByRunId({ transportId: 'x', runId: 'r' })).resolves.toMatchObject({
      total: 0,
    });
  });
});
