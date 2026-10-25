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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET } from '@/app/api/chat/analysis-jobs/[jobId]/route';

const { mockGetFullAnalysisRun, mockCancelFullAnalysisRun } = vi.hoisted(() => ({
  mockGetFullAnalysisRun: vi.fn(),
  mockCancelFullAnalysisRun: vi.fn(),
}));

vi.mock('@/lib/http/api', () => ({
  withAuth:
    (handler: (req: Request, ctx: unknown) => Promise<Response>) =>
    (req: Request, ctx?: { params?: Promise<unknown> }) =>
      handler(req, {
        params: ctx?.params ?? Promise.resolve({ jobId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
        user: { userId: 'user-1' },
      }),
}));

vi.mock('@/lib/services/api-boundary', () => ({
  getFullAnalysisRun: mockGetFullAnalysisRun,
  cancelFullAnalysisRun: mockCancelFullAnalysisRun,
}));

describe('analysis-jobs/[jobId] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns 400 for invalid jobId', async () => {
      const res = await GET(new Request('http://localhost/api/chat/analysis-jobs/bad!id'), {
        params: Promise.resolve({ jobId: 'bad!id' }),
      } as never);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION');
    });

    it('returns 404 when job is not found', async () => {
      mockGetFullAnalysisRun.mockResolvedValueOnce(null);
      const res = await GET(
        new Request('http://localhost/api/chat/analysis-jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
        {
          params: Promise.resolve({ jobId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
        } as never,
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('returns job state on success', async () => {
      mockGetFullAnalysisRun.mockResolvedValueOnce({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'running',
        progress: [],
        result: null,
        error: null,
        createdAt: '2026-10-15T00:00:00.000Z',
        completedAt: null,
      });

      const res = await GET(
        new Request('http://localhost/api/chat/analysis-jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
        {
          params: Promise.resolve({ jobId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
        } as never,
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(json.status).toBe('running');
    });
  });

  describe('DELETE', () => {
    it('returns 400 for invalid jobId', async () => {
      const res = await DELETE(
        new Request('http://localhost/api/chat/analysis-jobs/bad!id', { method: 'DELETE' }),
        {
          params: Promise.resolve({ jobId: 'bad!id' }),
        } as never,
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION');
    });

    it('returns 404 when job cannot be found or cancelled', async () => {
      mockCancelFullAnalysisRun.mockResolvedValueOnce(null);
      const res = await DELETE(
        new Request(
          'http://localhost/api/chat/analysis-jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          { method: 'DELETE' },
        ),
        {
          params: Promise.resolve({ jobId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
        } as never,
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('cancels job and returns status cancelled', async () => {
      mockCancelFullAnalysisRun.mockResolvedValueOnce({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'cancelled',
        progress: [],
        result: null,
        error: 'Cancelled by user',
        createdAt: '2026-10-15T00:00:00.000Z',
        completedAt: '2026-10-15T00:01:00.000Z',
      });

      const res = await DELETE(
        new Request(
          'http://localhost/api/chat/analysis-jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          { method: 'DELETE' },
        ),
        {
          params: Promise.resolve({ jobId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
        } as never,
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(json.status).toBe('cancelled');
      expect(json.cancelled).toBe(true);
      expect(mockCancelFullAnalysisRun).toHaveBeenCalledWith(
        'user-1',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
    });
  });
});
