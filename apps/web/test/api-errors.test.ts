import { describe, expect, it } from 'vitest';

import { jsonApiError } from '../src/lib/api-errors';

describe('jsonApiError', () => {
  it('returns the standard envelope and request-id header', async () => {
    const req = new Request('http://localhost/api/admin/example', {
      headers: { 'X-Request-Id': 'request-123' },
    });
    const response = jsonApiError('FORBIDDEN', 'Denied', 403, req);
    expect(response.status).toBe(403);
    expect(response.headers.get('X-Request-Id')).toBe('request-123');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'FORBIDDEN', message: 'Denied', requestId: 'request-123' },
    });
  });

  it('does not echo invalid or missing request IDs', async () => {
    const response = jsonApiError(
      'NOT_FOUND',
      'Missing',
      404,
      new Request('http://localhost/api/example'),
    );
    expect(response.headers.get('X-Request-Id')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'Missing' },
    });
  });
});
