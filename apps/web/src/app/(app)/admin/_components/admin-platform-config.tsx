// SPDX-License-Identifier: Apache-2.0

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

// Admin platform configuration shell. State lives in
// `config-sections/use-platform-config.ts`; each card is independent.
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { SkeletonCard } from '@/components/ui/skeleton';

import { AdminErrorBlock } from './admin-error-block';
import { MarketBudgetSection } from './config-sections/market-budget-section';
import { ProviderKeysSection } from './config-sections/provider-keys-section';
import { RoutingSection } from './config-sections/routing-section';
import { PlatformTelemetryBanner } from './config-sections/telemetry-banner';
import { ToolsSection } from './config-sections/tools-section';
import { usePlatformConfig } from './config-sections/use-platform-config';

export function AdminPlatformConfig() {
  const controller = usePlatformConfig();
  const { data, state, loadConfig } = controller;

  if (state.loading && !data) return <SkeletonCard lines={6} />;

  if (state.fetchError || !data) {
    return (
      <SettingsSection
        title="Platform AI, Models & Market Feeds"
        description="Global SaaS configuration for all Kestrel subscribers."
      >
        <AdminErrorBlock
          message={state.fetchError ?? 'Unable to load platform configuration'}
          onRetry={loadConfig}
        />
      </SettingsSection>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PlatformTelemetryBanner controller={controller} />
      <ProviderKeysSection controller={controller} />
      <RoutingSection controller={controller} />
      <MarketBudgetSection controller={controller} />
      <ToolsSection controller={controller} />
    </div>
  );
}
