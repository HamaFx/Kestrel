import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getAlertRoute } from '@/app/api/alerts/[id]/route';
import { GET as getThreadRoute } from '@/app/api/chat/threads/[id]/route';
import { GET as getJournalRoute } from '@/app/api/journal/[id]/route';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetThread = vi.hoisted(() => vi.fn());
const mockGetJournalEntry = vi.hoisted(() => vi.fn());
const mockGetAlert = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/services/chat', () => ({
  getThreadService: mockGetThread,
  getThreadWithMessagesService: vi.fn(),
  deleteThreadService: vi.fn(),
  updateThreadAnalysisModeService: vi.fn(),
  updateThreadPinnedSymbolService: vi.fn(),
}));
vi.mock('@/lib/services/journal', () => ({
  getJournalEntryService: mockGetJournalEntry,
  updateJournalEntryService: vi.fn(),
  deleteJournalEntryService: vi.fn(),
  JournalPatchSchema: { parse: vi.fn() },
}));
vi.mock('@/lib/services/alerts', () => ({
  getAlertService: mockGetAlert,
  updateAlertService: vi.fn(),
  deleteAlertService: vi.fn(),
  AlertPatchSchema: { parse: vi.fn() },
}));

const USER_ID = 'owner-user';
const OTHER_ID = 'different-user';
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mockAuth.mockResolvedValue({ user: { id: USER_ID, email: 'owner@example.com' } });
  mockGetThread.mockResolvedValue(null);
  mockGetJournalEntry.mockResolvedValue(null);
  mockGetAlert.mockResolvedValue(null);
});

afterEach(() => vi.clearAllMocks());

describe('resource ownership boundaries', () => {
  it('rejects anonymous thread reads before calling the service', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await getThreadRoute(
      new Request('http://localhost/api/chat/threads/thread-1'),
      params('thread-1'),
    );

    expect(response.status).toBe(401);
    expect(mockGetThread).not.toHaveBeenCalled();
  });

  it('passes the authenticated user id when reading a thread', async () => {
    const response = await getThreadRoute(
      new Request('http://localhost/api/chat/threads/thread-1?fields=thread'),
      params('thread-1'),
    );

    expect(response.status).toBe(404);
    expect(mockGetThread).toHaveBeenCalledWith(USER_ID, 'thread-1');
    expect(mockGetThread).not.toHaveBeenCalledWith(OTHER_ID, 'thread-1');
  });

  it('returns not-found for a journal id outside the authenticated owner scope', async () => {
    const response = await getJournalRoute(
      new Request('http://localhost/api/journal/entry-from-other-user'),
      params('entry-from-other-user'),
    );

    expect(response.status).toBe(404);
    expect(mockGetJournalEntry).toHaveBeenCalledWith(USER_ID, 'entry-from-other-user');
  });

  it('returns not-found for an alert id outside the authenticated owner scope', async () => {
    const response = await getAlertRoute(
      new Request('http://localhost/api/alerts/alert-from-other-user'),
      params('alert-from-other-user'),
    );

    expect(response.status).toBe(404);
    expect(mockGetAlert).toHaveBeenCalledWith(USER_ID, 'alert-from-other-user');
  });
});
