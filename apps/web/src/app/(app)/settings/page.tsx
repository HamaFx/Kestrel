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
  IconCpu,
  IconInfoCircle,
  IconKey,
  IconPalette,
  IconPuzzle,
  IconRobot,
  IconShield,
  IconTrendingUp,
} from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { checkIsAdmin } from '@/lib/auth/admin-check';

import { AboutCard } from './_components/about-card';
import { OnboardingResetCard } from './_components/onboarding-reset-card';
import { SettingsSection } from './_components/settings-section';
import { UsageGlance } from './_components/usage-glance';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your watchlist, risk rules, alerts, AI provider keys, and account security.',
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
      <UsageGlance userId={userId} />

      {/* Grouped Quick Links */}
      <div className="flex flex-col gap-2">
        <h2 className="text-fg-subtle px-0.5 text-[11px] font-semibold tracking-wider uppercase">
          Settings Categories
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickLink
            href="/settings/plugins"
            icon={<IconPuzzle className="size-4.5" />}
            title="Plugins"
            description="Install backtesting, paper trading, Telegram, and custom agents in one click"
          />
          <QuickLink
            href="/settings/symbols"
            icon={<IconTrendingUp className="size-4.5" />}
            title="Watchlist Symbols"
            description="Customize the Gold, Forex, and Crypto pairs on your watchlist"
          />
          <QuickLink
            href="/settings/notifications"
            icon={<IconBell className="size-4.5" />}
            title="Notifications & Telegram"
            description="Email, browser push, Telegram bot linking, and quiet hours"
          />
          <QuickLink
            href="/settings/profile"
            icon={<IconShield className="size-4.5" />}
            title="Profile & Security"
            description="Display name, password, two-factor auth, and active sessions"
          />
          <QuickLink
            href="/settings/appearance"
            icon={<IconPalette className="size-4.5" />}
            title="Appearance & Data"
            description="Theme styling, default chart symbol, and trade journal exports"
          />
          <QuickLink
            href="/settings/api-keys"
            icon={<IconKey className="size-4.5" />}
            title="API Keys & Vault"
            description="Connect your personal AI provider keys — encrypted at rest with AES-256-GCM"
          />
          <QuickLink
            href="/settings/models"
            icon={<IconCpu className="size-4.5" />}
            title="Model Routing & Fallbacks"
            description="Default chat, vision, and embedding models plus your fallback chain"
          />
          <QuickLink
            href="/settings/agent"
            icon={<IconRobot className="size-4.5" />}
            title="Agent Preferences"
            description="Committee analysis mode, custom instructions, and per-desk model overrides"
          />
        </div>
      </div>

      <SettingsSection
        icon={<IconInfoCircle className="size-4" />}
        title="Account Session"
        description="Sign out and platform information"
      >
        <AboutCard />
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection
          icon={<IconShield className="size-4" />}
          title="Admin & Platform Controls"
          description="Operator-only configuration for market feeds, system diagnostics, and the platform admin console"
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QuickLink
                href="/admin"
                icon={<IconShield className="size-4.5" />}
                title="Admin Console"
                description="System health, user management, cron jobs, audit logs, and platform AI defaults"
              />
            </div>
            <OnboardingResetCard />
          </div>
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
      className="surface-panel group hover:border-brand/30 hover:bg-bg-elev-2/60 tactile-press flex items-center gap-3.5 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)] transition-all active:translate-y-[0.5px]"
    >
      <span className="surface-well text-fg-muted group-hover:text-brand inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/5 shadow-xs transition-colors">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-sm leading-tight font-semibold">{title}</span>
        <span className="text-fg-subtle text-xs leading-snug">{description}</span>
      </div>
      <IconChevronRight className="text-fg-subtle/70 group-hover:text-fg size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
