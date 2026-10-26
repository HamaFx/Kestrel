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
  it('renders primary mobile bottom navigation links and HUD trigger', () => {
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
    expect(screen.getByText('HUD')).toBeTruthy();
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

describe('NavDrawer Mobile Cockpit Component', () => {
  it('renders brand HUD lockup, New Thesis CTA, and Operator Station when opened', () => {
    mockPathname = '/dashboard';
    render(
      <MotionRoot>
        <NavDrawerProvider>
          <DrawerTestConsumer userName="Alex Trader" userEmail="alex@kestrel.io" />
        </NavDrawerProvider>
      </MotionRoot>,
    );

    // Click to open drawer
    act(() => {
      fireEvent.click(screen.getByTestId('open-drawer-btn'));
    });

    // Brand and HUD badge
    expect(screen.getByText(/HUD v2\.4/i)).toBeTruthy();

    // Tactical CTA
    expect(screen.getByText('NEW THESIS')).toBeTruthy();

    // Operator station
    expect(screen.getByText('// OPERATOR STATION')).toBeTruthy();
    expect(screen.getByText('Alex Trader')).toBeTruthy();
    expect(screen.getByText('BYOK')).toBeTruthy();

    // Disconnect session
    expect(screen.getByText('DISCONNECT SESSION')).toBeTruthy();
  });
});
