// @vitest-environment jsdom

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

// Phase 3 Task 4 — the Admin Control Plane used to hide 7–8 of its 16 tabs
// behind a scrollbar-less overflow strip. Every section must now be rendered
// together with its domain heading, in one click.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupAdminTabs, TAB_GROUPS } from '@/app/(app)/admin/_components/admin-tab-groups';
import { TABS } from '@/app/(app)/admin/_components/admin-tabs';
import AdminPage from '@/app/(app)/admin/page';

const mockReplace = vi.fn();
const mockSearchParams = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
}));

vi.mock('next/dynamic', () => ({
  default: () => {
    function Placeholder() {
      return <div>Tab content</div>;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Placeholder as any;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.clear();
});

afterEach(cleanup);

describe('Admin Control Plane grouping (Phase 3)', () => {
  it('assigns every tab to exactly one domain group', () => {
    const grouped = groupAdminTabs(TABS).flatMap((entry) => entry.tabs.map((tab) => tab.id));

    expect(groupAdminTabs(TABS).map((entry) => entry.group.label)).toEqual(
      TAB_GROUPS.map((group) => group.label),
    );
    expect(grouped).toHaveLength(TABS.length);
    expect(new Set(grouped).size).toBe(TABS.length);
  });

  it('renders all 16 section tabs with their four domain headings', () => {
    render(<AdminPage />);

    expect(screen.getAllByRole('tab')).toHaveLength(16);
    for (const group of TAB_GROUPS) {
      expect(screen.getByText(group.label)).toBeTruthy();
    }
  });

  it('activates a tab from the last group in one click', () => {
    render(<AdminPage />);

    fireEvent.click(screen.getByRole('tab', { name: /Dev Tools/i }));
    expect(mockReplace).toHaveBeenCalledWith('/admin?tab=devtools', { scroll: false });
  });
});
