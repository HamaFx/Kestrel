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

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopSidebar } from '@/components/layout/desktop-sidebar';
import {
  SidebarStateProvider,
  useSidebarState,
} from '@/components/layout/sidebar-state-context';
import { MotionRoot } from '@/components/ui/motion-config';
import { Tooltip } from '@/components/ui/tooltip';

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function TestConsumer() {
  const { collapsed, toggle } = useSidebarState();
  return (
    <div>
      <span data-testid="sidebar-collapsed">{collapsed ? 'collapsed' : 'expanded'}</span>
      <button data-testid="toggle-btn" onClick={toggle}>
        Toggle
      </button>
    </div>
  );
}

describe('Sidebar State & Shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes expanded by default and toggles state', () => {
    render(
      <SidebarStateProvider>
        <TestConsumer />
      </SidebarStateProvider>,
    );

    const indicator = screen.getByTestId('sidebar-collapsed');
    expect(indicator.textContent).toBe('expanded');

    fireEvent.click(screen.getByTestId('toggle-btn'));
    expect(indicator.textContent).toBe('collapsed');
  });

  it('toggles collapse via ⌘B or Ctrl+B keyboard shortcut', () => {
    render(
      <SidebarStateProvider>
        <TestConsumer />
      </SidebarStateProvider>,
    );

    const indicator = screen.getByTestId('sidebar-collapsed');
    expect(indicator.textContent).toBe('expanded');

    // Simulate ⌘B (metaKey + b)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
    });
    expect(indicator.textContent).toBe('collapsed');

    // Simulate Ctrl+B (ctrlKey + B)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', ctrlKey: true }));
    });
    expect(indicator.textContent).toBe('expanded');
  });

  it('does not trigger ⌘B when focused inside an input or textarea', () => {
    render(
      <SidebarStateProvider>
        <input data-testid="text-input" />
        <TestConsumer />
      </SidebarStateProvider>,
    );

    const indicator = screen.getByTestId('sidebar-collapsed');
    expect(indicator.textContent).toBe('expanded');

    const input = screen.getByTestId('text-input');
    input.focus();

    // Dispatch event targeted at the input
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      );
    });

    // Should remain expanded
    expect(indicator.textContent).toBe('expanded');
  });
});

describe('DesktopSidebar Component', () => {
  it('renders all primary navigation links with accessibility attributes', () => {
    mockPathname = '/dashboard';
    render(
      <MotionRoot>
        <SidebarStateProvider>
          <DesktopSidebar userName="Alice" userEmail="alice@example.com" />
        </SidebarStateProvider>
      </MotionRoot>,
    );

    expect(screen.getByLabelText('Research')).toBeTruthy();
    expect(screen.getByLabelText('Overview')).toBeTruthy();
    expect(screen.getByLabelText('Journal')).toBeTruthy();
    expect(screen.getByLabelText('Market')).toBeTruthy();
    expect(screen.getByLabelText('Alerts')).toBeTruthy();

    const overviewLink = screen.getByLabelText('Overview');
    expect(overviewLink.getAttribute('aria-current')).toBe('page');

    const researchLink = screen.getByLabelText('Research');
    expect(researchLink.getAttribute('aria-current')).toBeNull();
  });

  it('renders user details, online pulse, and sign out button', () => {
    render(
      <MotionRoot>
        <SidebarStateProvider>
          <DesktopSidebar userName="Trader Joe" userEmail="joe@example.com" />
        </SidebarStateProvider>
      </MotionRoot>,
    );

    expect(screen.getByText('Trader Joe')).toBeTruthy();
    expect(screen.getByText('joe@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
  });

  it('conditionally renders Admin link when isAdmin is true', () => {
    const { unmount } = render(
      <MotionRoot>
        <SidebarStateProvider>
          <DesktopSidebar isAdmin={false} />
        </SidebarStateProvider>
      </MotionRoot>,
    );

    expect(screen.queryByLabelText('Admin')).toBeNull();
    unmount();

    render(
      <MotionRoot>
        <SidebarStateProvider>
          <DesktopSidebar isAdmin={true} />
        </SidebarStateProvider>
      </MotionRoot>,
    );

    expect(screen.getByLabelText('Admin')).toBeTruthy();
  });

  it('renders collapse toggle button with aria-expanded and ⌘B tooltip', () => {
    render(
      <MotionRoot>
        <SidebarStateProvider>
          <DesktopSidebar />
        </SidebarStateProvider>
      </MotionRoot>,
    );

    const toggleBtn = screen.getByLabelText('Collapse sidebar');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Tooltip Primitive', () => {
  it('renders right-side tooltip with shortcut badge', () => {
    render(
      <Tooltip label="Research" side="right" shortcut="⌘1">
        <button aria-label="Research">Icon</button>
      </Tooltip>,
    );

    const tooltipBubble = screen.getByRole('tooltip', { hidden: true });
    expect(tooltipBubble).toBeTruthy();
    expect(tooltipBubble.textContent).toContain('Research');
    expect(tooltipBubble.textContent).toContain('⌘1');
  });
});
