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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider, useNavDrawer } from '@/components/layout/nav-drawer-context';
import { MotionRoot } from '@/components/ui/motion-config';

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

vi.mock('@/hooks/use-prices', () => ({
  usePrice: () => ({
    tick: { symbol: 'XAUUSD', mid: 2734.5, bid: 2734.4, ask: 2734.6 },
    isLoading: false,
  }),
  usePrices: () => ({
    data: [{ symbol: 'XAUUSD', mid: 2734.5, bid: 2734.4, ask: 2734.6 }],
    isLoading: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MobileBottomNav Component', () => {
  it('renders the four workspace destinations plus the More trigger', () => {
    mockPathname = '/dashboard';
    render(
      <MotionRoot>
        <NavDrawerProvider>
          <MobileBottomNav />
        </NavDrawerProvider>
      </MotionRoot>,
    );

    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Journal')).toBeTruthy();
    expect(screen.getByText('Alerts')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.getByLabelText('Open navigation menu')).toBeTruthy();
    // The old shell called this trigger "HUD" and pulsed a fake status dot.
    expect(screen.queryByText('HUD')).toBeNull();
  });
});

function DrawerTestConsumer({ userName, userEmail }: { userName?: string; userEmail?: string }) {
  const { setOpen } = useNavDrawer();
  return (
    <div>
      <button data-testid="open-drawer-btn" onClick={() => setOpen(true)}>
        Open Drawer
      </button>
      <NavDrawer userName={userName} userEmail={userEmail} />
    </div>
  );
}

describe('NavDrawer Mobile Component', () => {
  it('mirrors the desktop rail: sections, new-thesis action, identity and sign-out', () => {
    mockPathname = '/dashboard';
    render(
      <MotionRoot>
        <NavDrawerProvider>
          <DrawerTestConsumer userName="Alex Trader" userEmail="alex@kestrel.io" />
        </NavDrawerProvider>
      </MotionRoot>,
    );

    act(() => {
      fireEvent.click(screen.getByTestId('open-drawer-btn'));
    });

    // Navigation, grouped the same way as the desktop rail
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(screen.getByText('Preferences')).toBeTruthy();
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();

    // Primary action
    expect(screen.getByText('New thesis')).toBeTruthy();

    // Identity + the way out both live in the footer
    expect(screen.getByText('Alex Trader')).toBeTruthy();
    expect(screen.getByText('alex@kestrel.io')).toBeTruthy();
    expect(screen.getByText('BYOK')).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();

    // Explicit dismiss — the sheet is otherwise only closed by scrim/swipe.
    expect(screen.getByLabelText('Close navigation')).toBeTruthy();
  });

  it('drops the terminal cosplay: no HUD badges, index numbers, or fake kbd hints', () => {
    mockPathname = '/dashboard';
    const { container } = render(
      <MotionRoot>
        <NavDrawerProvider>
          <DrawerTestConsumer userName="Alex Trader" userEmail="alex@kestrel.io" />
        </NavDrawerProvider>
      </MotionRoot>,
    );

    act(() => {
      fireEvent.click(screen.getByTestId('open-drawer-btn'));
    });

    expect(screen.queryByText(/HUD v/i)).toBeNull();
    expect(screen.queryByText('// OPERATOR STATION')).toBeNull();
    expect(screen.queryByText('DISCONNECT SESSION')).toBeNull();
    expect(screen.queryByText('01')).toBeNull();
    // Every ⌘1–⌘5 / ⌘, hint advertised a binding the app never had.
    expect(container.querySelectorAll('kbd')).toHaveLength(0);
  });
});
