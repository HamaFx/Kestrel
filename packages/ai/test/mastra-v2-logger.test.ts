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

import { describe, expect, it } from 'vitest';

import { MastraPinoLogger } from '../src/mastra-v2';

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
