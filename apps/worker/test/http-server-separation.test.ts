import { describe, expect, it, vi } from 'vitest';
import { createHealthServer, createProxyServer } from '../src/http-server';

const deps = {
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
  getLastTickAt: () => Date.now(),
  isSignalRConnected: () => true,
};

async function request(server: ReturnType<typeof createHealthServer>, path: string) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe('separate worker HTTP surfaces', () => {
  it('health server does not serve proxy routes', async () => {
    const response = await request(createHealthServer(deps), '/biquote/test');
    expect(response.status).toBe(404);
  });

  it('proxy server does not serve health routes', async () => {
    const response = await request(createProxyServer(deps), '/health/live');
    expect(response.status).toBe(404);
  });
});
