import { describe, expect, it, vi } from 'vitest';

import { auditAllRoutes } from '../../../tools/lighthouse/run.mjs';

describe('Lighthouse runner single-Chrome optimization', () => {
  it('launches and kills headless Chrome exactly once across multiple routes', async () => {
    const kill = vi.fn().mockResolvedValue(undefined);
    const launchChrome = vi.fn().mockResolvedValue({ port: 9222, kill });
    const runLighthouseFn = vi.fn().mockResolvedValue({
      categories: {
        performance: { score: 0.95 },
        accessibility: { score: 0.98 },
      },
    });

    const results = await auditAllRoutes(
      'http://localhost:3000',
      'authjs.session-token=test',
      ['/chat', '/dashboard', '/news'],
      { launchChrome, runLighthouseFn },
    );

    expect(results).toHaveLength(3);
    expect(launchChrome).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(runLighthouseFn).toHaveBeenCalledTimes(6);
  });
});
