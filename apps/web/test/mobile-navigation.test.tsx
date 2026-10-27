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

import { ThreadViewsDock } from '@/components/chat/thread-views-dock';
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

vi.mock('@/hooks/use-tf', () => ({
  useTimeframe: () => ['15m', vi.fn()],
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { unoptimized, ...rest } = props as React.ImgHTMLAttributes<HTMLImageElement> & {
      unoptimized?: boolean;
    };
    return <img {...rest} alt="" />;
  },
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

describe('Chat War Room sheet — mobile ergonomics', () => {
  function renderDock(onClose = vi.fn()) {
    render(
      <ThreadViewsDock
        isOpen
        onClose={onClose}
        activeTab="opinions"
        onTabChange={vi.fn()}
        symbol="XAUUSD"
        agentProgress={null}
        messages={[]}
      />,
    );
    return onClose;
  }

  it('renders a scrim that closes the sheet on tap', () => {
    const onClose = renderDock();
    const scrim = screen.getByLabelText('Close views backdrop');
    expect(scrim.className).toContain('bg-black/60');
    expect(scrim.className).toContain('lg:hidden');
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = renderDock();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dock tabs at a 44px minimum touch height on mobile', () => {
    renderDock();
    for (const label of ['Chart', 'Council', 'Plan']) {
      const tab = screen.getByRole('button', { name: new RegExp(label, 'i') });
      expect(tab.className).toContain('min-h-11');
      expect(tab.className).toContain('sm:min-h-9');
    }
  });

  it('shows the War Room watermark strip and closes via the X affordance', () => {
    const onClose = renderDock();
    expect(screen.getByText('KESTREL // SOVEREIGN COUNCIL')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close Views'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
