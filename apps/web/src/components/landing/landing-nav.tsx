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

import { useState, useEffect } from 'react';
import { Link } from 'next-view-transitions';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { TacticalFlameButton } from '@/components/landing/landing-button';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

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
            <span className="size-2 rounded-full bg-bull animate-pulse shadow-[0_0_8px_rgba(63,158,61,0.6)]" />
            <span className="font-mono text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">
              XAU/USD · LIVE
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#desks"
            className="font-sans text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Specialist Desks
          </a>
          <a
            href="#simulator"
            className="font-sans text-sm font-medium text-brand transition-colors hover:text-brand"
          >
            Live Simulator
          </a>
          <a
            href="#stepper"
            className="font-sans text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Pipeline
          </a>
          <a
            href="#architecture"
            className="font-sans text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Architecture
          </a>
          <a
            href="#faq"
            className="font-sans text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            FAQ
          </a>
          {isAuthenticated && (
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-brand font-semibold px-2.5 py-1 rounded-md bg-brand/10 border border-brand/25 transition-colors hover:bg-brand/20"
            >
              <span className="size-1.5 rounded-full bg-brand animate-pulse" />
              <span>Terminal</span>
            </Link>
          )}
        </nav>

        {/* Action CTAs & Mobile Toggle */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <TacticalFlameButton href="/chat" label="Open Terminal" className="text-xs py-[0.5em] pr-[2.8em] pl-[1em]" />
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-fg-muted hover:text-fg">
                  Sign In
                </Button>
              </Link>
              <TacticalFlameButton href="/login" label="Launch Terminal" className="text-xs py-[0.5em] pr-[2.8em] pl-[1em]" />
            </>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-fg md:hidden"
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
              Pipeline
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              Architecture
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              FAQ
            </a>
            <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
              <Link href={isAuthenticated ? '/chat' : '/login'} onClick={() => setMobileMenuOpen(false)}>
                <Button variant="tactical" size="md" className="w-full">
                  {isAuthenticated ? 'Open Terminal' : 'Launch Terminal'}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
