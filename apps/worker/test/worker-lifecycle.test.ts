import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

describe('worker lifecycle contracts', () => {
  it('starts both consumers before declaring readiness', () => {
    expect(source.indexOf('await consumer.start()')).toBeGreaterThan(-1);
    expect(source.indexOf('await binanceConsumer.start()')).toBeGreaterThan(-1);
    expect(source.indexOf('notifyReady()')).toBeGreaterThan(source.indexOf('await binanceConsumer.start()'));
  });

  it('cleans up the worker when HTTP listener startup fails', () => {
    expect(source).toContain('post-startup initialisation failed');
    expect(source).toContain('await worker.stop()');
    expect(source).toContain('proxyServer?.close()');
  });

  it('closes both HTTP servers during shutdown', () => {
    expect(source).toContain('healthServer!.close()');
    expect(source).toContain('proxyServer?.close()');
  });
});
