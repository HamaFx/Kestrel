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
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// Mock IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly scrollMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = vi.fn((target: Element) => {
    this.callback(
      [
        {
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: target.getBoundingClientRect(),
          isIntersecting: true,
          rootBounds: null,
          target,
          time: Date.now(),
        },
      ],
      this,
    );
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}

beforeAll(() => {
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const listeners: Array<(e: MediaQueryListEvent) => void> = [];
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') listeners.push(handler);
        }),
        removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
          const index = listeners.indexOf(handler);
          if (index !== -1) listeners.splice(index, 1);
        }),
        dispatchEvent: vi.fn((e: Event) => {
          listeners.forEach((l) => l(e as MediaQueryListEvent));
          return true;
        }),
      };
    }),
  });
});

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: React.ComponentProps<'img'>) => (
    <img src={typeof src === 'string' ? src : ''} alt={alt || ''} {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/hooks/use-prices', () => ({
  usePrices: () => ({ data: undefined, isLoading: false }),
}));

import { MotionRoot } from '@/components/ui/motion-config';
import { LandingPageView } from '@/components/landing/landing-page-view';
import { LandingStepper } from '@/components/landing/landing-stepper';
import { LandingArchitecture } from '@/components/landing/landing-architecture';
import { Landing3DHologram } from '@/components/landing/landing-3d-hologram';
import { TickerTape } from '@/components/layout/ticker-tape';

describe('Milestone 5 Empirical Verification: Motion Root & LandingPageView', () => {
  it('verifies MotionRoot configures LazyMotion with domAnimation and strict mode', () => {
    const motionConfigPath = path.resolve(__dirname, '../../components/ui/motion-config.tsx');
    const motionCode = fs.readFileSync(motionConfigPath, 'utf8');

    expect(motionCode).toContain('<LazyMotion features={domAnimation} strict>');
    expect(motionCode).toContain('reducedMotion="user"');
    expect(motionCode).toContain("transition={{ type: 'spring', stiffness: 400, damping: 30 }}");
  });

  it('verifies app/page.tsx wraps LandingPageView with MotionRoot', () => {
    const pagePath = path.resolve(__dirname, '../../app/page.tsx');
    const pageCode = fs.readFileSync(pagePath, 'utf8');

    expect(pageCode).toContain('<MotionRoot>');
    expect(pageCode).toContain('<LandingPageView');
    expect(pageCode).toContain('</MotionRoot>');
  });

  it('renders LandingPageView seamlessly inside MotionRoot without throwing any runtime errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(
      <MotionRoot>
        <LandingPageView isAuthenticated={false} />
      </MotionRoot>,
    );

    expect(container).not.toBeNull();
    expect(container.querySelector('nav')).not.toBeNull();
    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('footer')).not.toBeNull();

    expect(container.querySelector('#stepper')).not.toBeNull();
    expect(container.querySelector('#architecture')).not.toBeNull();
    expect(container.querySelector('#faq')).not.toBeNull();

    warnSpy.mockRestore();
  });
});

describe('Milestone 5 Empirical Verification: LandingStepper Continuous SVG Pipeline', () => {
  it('renders the mathematical continuous circuit SVG spine with defs and traces', () => {
    const { container } = render(
      <MotionRoot>
        <LandingStepper />
      </MotionRoot>,
    );

    const svgSpine = container.querySelector('svg[viewBox="0 0 32 480"]');
    expect(svgSpine).not.toBeNull();

    const gradient = svgSpine?.querySelector('#circuit-wire-gradient');
    expect(gradient).not.toBeNull();
    const filter = svgSpine?.querySelector('#glow-bead');
    expect(filter).not.toBeNull();

    const bgTrace = svgSpine?.querySelector('path[d="M 16 20 L 16 460"]');
    expect(bgTrace).not.toBeNull();
    expect(bgTrace?.getAttribute('stroke')).toBe('rgba(255, 255, 255, 0.08)');

    const activePath = svgSpine?.querySelector('path[stroke="url(#circuit-wire-gradient)"]');
    expect(activePath).not.toBeNull();

    const runnerBead = svgSpine?.querySelector('circle[filter="url(#glow-bead)"]');
    expect(runnerBead).not.toBeNull();
  });

  it('allows interactive switching between 4 pipeline stages and updates workbench', async () => {
    render(
      <MotionRoot>
        <LandingStepper />
      </MotionRoot>,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(4);

    expect(screen.getByText(/venue_ingestion\.ts/i)).not.toBeNull();
    expect(screen.getByText(/14,200 ticks\/sec/i)).not.toBeNull();

    await act(async () => {
      fireEvent.click(tabs[1]!);
    });

    expect(await screen.findByText(/committee_deliberation\.ts/i)).not.toBeNull();
    expect(await screen.findByText(/4 Isolated Sandboxes/i)).not.toBeNull();
    expect(await screen.findByText(/STAGE 02 VERIFIED/i)).not.toBeNull();

    await act(async () => {
      fireEvent.click(tabs[2]!);
    });

    expect(await screen.findByText(/arbitration_veto\.ts/i)).not.toBeNull();
    expect(await screen.findByText(/STAGE 03 VERIFIED/i)).not.toBeNull();

    await act(async () => {
      fireEvent.click(tabs[3]!);
    });

    expect(await screen.findByText(/execution_cones\.ts/i)).not.toBeNull();
    expect(await screen.findByText(/STAGE 04 VERIFIED/i)).not.toBeNull();
  });

  it('toggles auto-advancing pipeline runner pause/resume button', async () => {
    render(
      <MotionRoot>
        <LandingStepper />
      </MotionRoot>,
    );

    const pauseBtn = screen.getByText(/Auto-Advancing Pipeline \(Active\)/i);
    expect(pauseBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(pauseBtn);
    });

    expect(screen.getByText(/Resume Auto-Run/i)).not.toBeNull();
  });
});

describe('Milestone 5 Empirical Verification: LandingArchitecture Rotating Marquee & 3D Stack', () => {
  it('renders dual concentric circular rotating SVG marquee with motion-reduce overrides', () => {
    const { container } = render(
      <MotionRoot>
        <LandingArchitecture />
      </MotionRoot>,
    );

    const marquees = container.querySelectorAll('svg[viewBox="0 0 400 400"]');
    expect(marquees.length).toBe(2);

    const outer = marquees[0]!;
    const outerClass = outer.getAttribute('class') || '';
    expect(outerClass).toContain('animate-[spin_32s_linear_infinite]');
    expect(outerClass).toContain('motion-reduce:animate-none');
    expect(outer.querySelector('#circle-outer')).not.toBeNull();
    expect(outer.textContent).toContain('KESTREL ARCHITECTURE');

    const inner = marquees[1]!;
    const innerClass = inner.getAttribute('class') || '';
    expect(innerClass).toContain('animate-[spin_24s_linear_infinite_reverse]');
    expect(innerClass).toContain('motion-reduce:animate-none');
    expect(inner.querySelector('#circle-inner')).not.toBeNull();
    expect(inner.textContent).toContain('1.0% VETO FIREWALL');
  });

  it('renders 4 isometric layers and updates active layer telemetry on click', async () => {
    render(
      <MotionRoot>
        <LandingArchitecture />
      </MotionRoot>,
    );

    expect(screen.getByText(/APEX EXECUTION LAYER/i)).not.toBeNull();
    expect(screen.getByText(/SAFETY GOVERNOR LAYER/i)).not.toBeNull();
    expect(screen.getByText(/CONSENSUS SYNDICATE LAYER/i)).not.toBeNull();
    expect(screen.getByText(/FOUNDATION DATA LAYER/i)).not.toBeNull();

    expect(screen.getByText(/TIER 03 TELEMETRY/i)).not.toBeNull();

    const execBtn = screen.getByText(/APEX EXECUTION LAYER/i).closest('button')!;
    await act(async () => {
      fireEvent.click(execBtn);
    });

    expect(await screen.findByText(/TIER 04 TELEMETRY/i)).not.toBeNull();
  });
});

describe('Milestone 5 Empirical Verification: Landing3DHologram Reduced-Motion & Memory Leak Prevention', () => {
  it('safely handles environments where WebGL is unsupported without throwing uncaught errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => {
      const { unmount } = render(<Landing3DHologram />);
      unmount();
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Landing3DHologram] WebGL initialization failed or unsupported:'),
      expect.anything(),
    );

    warnSpy.mockRestore();
  });

  it('verifies dynamic reduced-motion event listener and cleanup contracts in source implementation', () => {
    const hologramSourcePath = path.resolve(__dirname, '../../components/landing/landing-3d-hologram.tsx');
    const source = fs.readFileSync(hologramSourcePath, 'utf8');

    // 1. Dynamic media query change listener
    expect(source).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(source).toContain("motionMediaQuery?.addEventListener('change', handleMotionChange);");
    expect(source).toContain('speedMultiplier = prefersReducedMotion ? 0.05 : 1;');

    // 2. Cleanup contracts on unmount
    expect(source).toContain("motionMediaQuery?.removeEventListener('change', handleMotionChange);");
    expect(source).toContain('observer.disconnect();');
    expect(source).toContain('cancelAnimationFrame(animationId);');
    expect(source).toContain("container.removeEventListener('pointerdown', onPointerDown);");
    expect(source).toContain("window.removeEventListener('pointermove', onPointerMove);");
    expect(source).toContain("window.removeEventListener('pointerup', onPointerUp);");
    expect(source).toContain("window.removeEventListener('resize', onResize);");

    // 3. WebGL and three.js memory leak disposal
    expect(source).toContain('renderer.dispose();');
    expect(source).toContain('coreGeo.dispose();');
    expect(source).toContain('wireGeo.dispose();');
    expect(source).toContain('ring1Geo.dispose();');
    expect(source).toContain('particleGeo.dispose();');
    expect(source).toContain('coreMat.dispose();');
    expect(source).toContain('wireMat.dispose();');
    expect(source).toContain('ring1Mat.dispose();');
    expect(source).toContain('particleMat.dispose();');
  });
});

describe('Milestone 5 Empirical Verification: Continuous Marquee Accessibility', () => {
  it('verifies TickerTape .ticker-track marquee has aria-hidden="true" to eliminate screen reader churn', () => {
    const { container } = render(<TickerTape />);

    const tracks = container.querySelectorAll('.ticker-track');
    expect(tracks.length).toBeGreaterThan(0);
    tracks.forEach((track) => {
      expect(track.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
