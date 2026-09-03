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

import { Link } from 'next-view-transitions';
import { Button } from '@/components/ui/button';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#121212]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Lockup */}
        <div className="flex items-center gap-6">
          <KestrelBrand variant="lockup" href="/" label="Kestrel" />
          
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 md:flex">
            <span className="size-2 rounded-full bg-bull animate-pulse shadow-[0_0_8px_rgba(63,158,61,0.6)]" />
            <span className="font-mono text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
              XAU/USD · LIVE
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#desks"
            className="font-sans text-sm text-fg-muted transition-colors hover:text-fg"
          >
            Specialist Desks
          </a>
          <a
            href="#stepper"
            className="font-sans text-sm text-fg-muted transition-colors hover:text-fg"
          >
            How It Works
          </a>
          <a
            href="#architecture"
            className="font-sans text-sm text-fg-muted transition-colors hover:text-fg"
          >
            Architecture
          </a>
          <a
            href="#faq"
            className="font-sans text-sm text-fg-muted transition-colors hover:text-fg"
          >
            FAQ
          </a>
        </nav>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign In
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="tactical" size="sm">
              Launch Terminal
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
