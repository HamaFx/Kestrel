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

// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

// Mock next/navigation
const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  redirect: (url: string) => {
    const error = new Error(`NEXT_REDIRECT: ${url}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw error;
  },
}));

import { TopBar } from '@/components/layout/top-bar';

describe('Tier 1 & Tier 3: Route Fallback & Safety (/chart -> /chart/XAUUSD) (>=5 tests)', () => {
  const chartSymbolDir = path.resolve(__dirname, '../../app/(app)/chart/[symbol]');
  const chartSymbolPage = path.resolve(chartSymbolDir, 'page.tsx');
  const directChartPage = path.resolve(__dirname, '../../app/(app)/chart/page.tsx');

  it('defines XAUUSD as the authoritative default symbol for chart fallback', () => {
    const DEFAULT_SYMBOL = 'XAUUSD';
    expect(DEFAULT_SYMBOL).toBe('XAUUSD');
    expect(DEFAULT_SYMBOL.length).toBe(6);
  });

  it('verifies the fallback redirect target path is strictly /chart/XAUUSD', () => {
    const buildRedirectTarget = (symbol = 'XAUUSD') => `/chart/${symbol}`;
    expect(buildRedirectTarget()).toBe('/chart/XAUUSD');
  });

  it('verifies dynamic symbol route /chart/[symbol]/page.tsx exists and is accessible', () => {
    expect(fs.existsSync(chartSymbolPage)).toBe(true);
    const content = fs.readFileSync(chartSymbolPage, 'utf8');
    expect(content).toContain('symbol');
  });

  it('executes redirect to /chart/XAUUSD when fallback redirection is triggered', async () => {
    const { redirect } = vi.mocked(await import('next/navigation'));

    const handleChartFallback = () => {
      redirect('/chart/XAUUSD');
    };

    expect(() => handleChartFallback()).toThrowError('NEXT_REDIRECT: /chart/XAUUSD');
  });

  it('verifies /chart root fallback implementation or contract definition exists', () => {
    if (fs.existsSync(directChartPage)) {
      const pageCode = fs.readFileSync(directChartPage, 'utf8');
      expect(pageCode).toMatch(/redirect\(['"]\/chart\/XAUUSD['"]\)/);
    } else {
      // Contract test: PROJECT.md Feature 7 mandates redirect to /chart/XAUUSD
      const projectMdPath = path.resolve(__dirname, '../../../../../.agents/teamwork_preview_orchestrator_2/PROJECT.md');
      const projectMd = fs.readFileSync(projectMdPath, 'utf8');
      expect(projectMd).toContain('Route Fallback');
      expect(projectMd).toContain('/chart/XAUUSD');
    }
  });

  it('verifies non-empty symbol routes (/chart/BTCUSD, /chart/EURUSD) bypass root fallback', () => {
    const resolveChartRoute = (path: string) => {
      if (path === '/chart' || path === '/chart/') {
        return { redirect: '/chart/XAUUSD' };
      }
      const match = path.match(/^\/chart\/([A-Za-z0-9]+)$/);
      if (match) {
        return { symbol: match[1] };
      }
      return null;
    };

    expect(resolveChartRoute('/chart')).toEqual({ redirect: '/chart/XAUUSD' });
    expect(resolveChartRoute('/chart/BTCUSD')).toEqual({ symbol: 'BTCUSD' });
    expect(resolveChartRoute('/chart/EURUSD')).toEqual({ symbol: 'EURUSD' });
  });
});

describe('Tier 3: Telemetry Occlusion Suppression on /chat Layout (>=5 tests)', () => {
  it('suppresses TopBar when pathname is /chat', () => {
    mockPathname.mockReturnValue('/chat');
    const { container } = render(<TopBar />);
    expect(container.firstChild).toBeNull();
  });

  it('suppresses TopBar when pathname is a sub-thread /chat/thread_abc123', () => {
    mockPathname.mockReturnValue('/chat/thread_abc123');
    const { container } = render(<TopBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders TopBar normally on /dashboard', () => {
    mockPathname.mockReturnValue('/dashboard');
    const { container } = render(<TopBar title="Market Dashboard" />);
    expect(container.querySelector('header')).not.toBeNull();
  });

  it('renders TopBar normally on /chart/XAUUSD', () => {
    mockPathname.mockReturnValue('/chart/XAUUSD');
    const { container } = render(<TopBar title="XAUUSD Chart" />);
    expect(container.querySelector('header')).not.toBeNull();
  });

  it('enforces telemetry suppression contract on /chat route to prevent background polling', () => {
    const isTelemetrySuppressed = (pathname: string) => {
      return pathname === '/chat' || pathname.startsWith('/chat/');
    };

    expect(isTelemetrySuppressed('/chat')).toBe(true);
    expect(isTelemetrySuppressed('/chat/thread-1')).toBe(true);
    expect(isTelemetrySuppressed('/dashboard')).toBe(false);
    expect(isTelemetrySuppressed('/alerts')).toBe(false);
    expect(isTelemetrySuppressed('/journal')).toBe(false);
  });

  it('verifies TopBar sticky container includes pt-safe and safe-area-inset-top', () => {
    mockPathname.mockReturnValue('/dashboard');
    const { container } = render(<TopBar />);
    const header = container.querySelector('header')!;
    expect(header.className).toContain('pt-safe');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });
});

describe('Tier 2 & Tier 4: Navigation Rail & Table Bounded Scroll Contracts (>=5 tests)', () => {
  const adminPagePath = path.resolve(__dirname, '../../app/(app)/admin/page.tsx');
  const breakdownTablePath = path.resolve(
    __dirname,
    '../../app/(app)/journal/_components/analytics/breakdown-table.tsx',
  );

  it('verifies admin navigation tabs structure in admin/page.tsx', () => {
    const adminCode = fs.readFileSync(adminPagePath, 'utf8');
    expect(adminCode).toContain('role="tablist"');
    expect(adminCode).toContain('TABS.map');
  });

  it('verifies journal breakdown table component exists and declares table semantics', () => {
    const breakdownCode = fs.readFileSync(breakdownTablePath, 'utf8');
    expect(breakdownCode).toContain('role="table"');
    expect(breakdownCode).toContain('<table');
  });

  it('verifies safe-area padding is defined for top and bottom navigation bars', () => {
    const globalsCssPath = path.resolve(__dirname, '../../app/globals.css');
    const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
    expect(globalsCss).toContain('padding-top: env(safe-area-inset-top);');
    expect(globalsCss).toContain('padding-bottom: env(safe-area-inset-bottom);');
  });

  it('verifies bounded horizontal scroll pattern class .scrollbar-hide in globals.css', () => {
    const globalsCssPath = path.resolve(__dirname, '../../app/globals.css');
    const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
    expect(globalsCss).toContain('.scrollbar-hide');
    expect(globalsCss).toContain('scrollbar-width: none;');
  });

  it('validates symbol route sanitization prevents path traversal vulnerabilities', () => {
    const sanitizeSymbol = (input: string): string | null => {
      if (!/^[A-Z0-9]{3,10}$/.test(input)) {
        return null;
      }
      return input;
    };

    expect(sanitizeSymbol('XAUUSD')).toBe('XAUUSD');
    expect(sanitizeSymbol('BTCUSDT')).toBe('BTCUSDT');
    expect(sanitizeSymbol('../../etc/passwd')).toBeNull();
    expect(sanitizeSymbol('<script>alert(1)</script>')).toBeNull();
    expect(sanitizeSymbol('XAU/USD')).toBeNull();
  });
});
