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

import { useState } from 'react';
import { Link } from 'next-view-transitions';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#101112]/90 backdrop-blur-2xl transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Lockup */}
        <div className="flex items-center gap-6">
          <KestrelBrand variant="lockup" href="/" label="Kestrel" />

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
            href="#cases"
            className="font-sans text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            Case Studies
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
        </nav>

        {/* Action CTAs & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-fg-muted hover:text-fg">
              Sign In
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="tactical" size="sm" className="font-semibold shadow-sm">
              Launch Terminal
            </Button>
          </Link>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
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
        <div className="border-b border-white/10 bg-[#121314] px-4 py-6 md:hidden">
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
              href="#cases"
              onClick={() => setMobileMenuOpen(false)}
              className="text-fg-muted hover:text-fg transition-colors"
            >
              Case Studies
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
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="tactical" size="md" className="w-full">
                  Launch Terminal
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
