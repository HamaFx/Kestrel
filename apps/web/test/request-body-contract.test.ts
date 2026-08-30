import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('bounded request body contracts', () => {
  it.each([
    'src/app/api/portfolio/positions/route.ts',
    'src/app/api/portfolio/positions/[id]/route.ts',
    'src/app/api/portfolio/settings/route.ts',
    'src/app/api/notifications/noise-config/route.ts',
    'src/app/api/notifications/route-config/route.ts',
    'src/app/api/onboarding/save-progress/route.ts',
  ])('uses parseJsonBody for %s', (path) => {
    const source = read(path);
    expect(source).toContain('parseJsonBody');
    expect(source).not.toContain('await req.json()');
  });
});
