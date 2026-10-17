'use client';

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
import { IconMenu2, IconX } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useEffect, useState } from 'react';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { TacticalFlameButton } from '@/components/landing/landing-button';
import { Button } from '@/components/ui/button';

export interface LandingNavProps {
  isAuthenticated?: boolean;
}

export function LandingNav({ isAuthenticated = false }: LandingNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#101112]/90 backdrop-blur-2xl transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Lockup */}
        <div className="flex items-center gap-6">
          <KestrelBrand variant="lockup" href="/landing" label="Kestrel" />

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 lg:flex">
            <span className="bg-bull size-2 animate-pulse rounded-full shadow-[0_0_8px_rgba(63,158,61,0.6)]" />
            <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
              XAU/USD · LIVE
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#desks"
            className="text-fg-muted hover:text-fg font-sans text-sm font-medium transition-colors"
          >
            Specialist Desks
          </a>
          <a
            href="#simulator"
            className="text-brand hover:text-brand font-sans text-sm font-medium transition-colors"
          >
            Live Simulator
          </a>
          <a
            href="#stepper"
            className="text-fg-muted hover:text-fg font-sans text-sm font-medium transition-colors"
          >
            How It Works
          </a>
          <a
            href="#architecture"
            className="text-fg-muted hover:text-fg font-sans text-sm font-medium transition-colors"
          >
            System Stack
          </a>
          <a
            href="#faq"
            className="text-fg-muted hover:text-fg font-sans text-sm font-medium transition-colors"
          >
            FAQ
          </a>
          {isAuthenticated && (
            <Link
              href="/dashboard"
              className="text-brand bg-brand/10 border-brand/25 hover:bg-brand/20 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition-colors"
            >
              <span className="bg-brand size-1.5 animate-pulse rounded-full" />
              <span>Dashboard</span>
            </Link>
          )}
        </nav>

        {/* Action CTAs & Mobile Toggle */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <TacticalFlameButton
              href="/dashboard"
              label="Open Dashboard"
              className="py-[0.5em] pr-[2.8em] pl-[1em] text-xs"
            />
          ) : (
            <>
              <Link href="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-fg-muted hover:text-fg hidden sm:inline-flex"
                >
                  Sign In
                </Button>
              </Link>
              <TacticalFlameButton
                href="/register"
                label="Get Started"
                className="py-[0.5em] pr-[2.8em] pl-[1em] text-xs"
              />
            </>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-fg flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div id="mobile-nav" className="border-b border-white/10 bg-[#121314] px-4 py-6 md:hidden">
          <div className="flex flex-col gap-4 font-sans text-base">
            <a
              href="#desks"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              Specialist Desks
            </a>
            <a
              href="#simulator"
              onClick={() => setMobileMenuOpen(false)}
              className="text-brand font-medium transition-colors"
            >
              Live Simulator
            </a>
            <a
              href="#stepper"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              How It Works
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              System Stack
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              FAQ
            </a>
            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              {isAuthenticated ? (
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="tactical" size="md" className="w-full">
                    Open Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="tactical" size="md" className="w-full">
                      Get Started
                    </Button>
                  </Link>
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" size="md" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
