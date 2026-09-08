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

import {
  IconBell,
  IconChevronRight,
  IconDatabase,
  IconInfoCircle,
  IconPalette,
  IconRobot,
  IconShield,
  IconTrendingUp,
} from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { checkIsAdmin } from '@/lib/admin-check';

import { AboutCard } from './_components/about-card';
import { OnboardingResetCard } from './_components/onboarding-reset-card';
import { SettingsSection } from './_components/settings-section';
import { SystemStatusCard } from './_components/system-status-card';
import { UsageGlance } from './_components/usage-glance';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage profile, market feeds, API keys, AI model preferences, and security.',
};
export const revalidate = 60;

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const isAdmin = await checkIsAdmin();

  return (
    <div className="flex flex-col gap-6">
      <SystemStatusCard userId={userId} />
      <UsageGlance userId={userId} />

      {/* Grouped Quick Links */}
      <div className="flex flex-col gap-2">
        <h2 className="text-fg-subtle text-[11px] font-semibold tracking-wider uppercase px-0.5">
          Settings Categories
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickLink
            href="/settings/api-keys"
            icon={<IconRobot className="size-4.5" />}
            title="AI & Intelligence"
            description="BYOK provider keys, model routing, and agent tool execution"
          />
          <QuickLink
            href="/settings/security"
            icon={<IconShield className="size-4.5" />}
            title="Account & Security"
            description="Profile identity, password, two-factor auth, and active sessions"
          />
          <QuickLink
            href="/settings/symbols"
            icon={<IconTrendingUp className="size-4.5" />}
            title="Trading & Market"
            description="Watchlist instruments, symbol catalog, and portfolio risk limits"
          />
          <QuickLink
            href="/settings/notifications"
            icon={<IconBell className="size-4.5" />}
            title="Notifications & Channels"
            description="Email, browser push, Telegram bot integration, and noise control"
          />
          <QuickLink
            href="/settings/appearance"
            icon={<IconPalette className="size-4.5" />}
            title="Display & Preferences"
            description="Theme styling, language locale, and UI motion preferences"
          />
          <QuickLink
            href="/settings/data"
            icon={<IconDatabase className="size-4.5" />}
            title="Data & Storage"
            description="Local cache controls, trade history exports, and account reset"
          />
        </div>
      </div>

      <SettingsSection
        icon={<IconInfoCircle className="size-4" />}
        title="About"
        description="App info and system status"
      >
        <AboutCard />
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection
          icon={<IconShield className="size-4" />}
          title="Admin"
          description="Debug and testing tools"
        >
          <OnboardingResetCard />
        </SettingsSection>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="surface-panel group flex items-center gap-3.5 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)] transition-all hover:border-brand/30 hover:bg-bg-elev-2/60 tactile-press active:translate-y-[0.5px]"
    >
      <span className="surface-well text-fg-muted inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/5 shadow-xs transition-colors group-hover:text-brand">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-sm font-semibold leading-tight">{title}</span>
        <span className="text-fg-subtle text-xs leading-snug">{description}</span>
      </div>
      <IconChevronRight className="text-fg-subtle/70 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  );
}
