'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Unified Mastra run observability shell: window controls plus the run table
// backed by telemetry, workflow state and scores.
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { SkeletonCard } from '@/components/ui/skeleton';

import { AdminErrorBlock } from '../admin-error-block';
import { MastraRunsTable } from './mastra-runs-table';
import { MastraRunsToolbar } from './mastra-runs-toolbar';
import { useMastraRuns } from './use-mastra-runs';

export function AdminMastraRuns() {
  const { runs, loading, fetchError, hours, setHours, fetchRuns } = useMastraRuns();

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection
        title="Mastra Runs"
        description="Unified Mastra run observability (telemetry + workflow state + scores)."
      >
        <AdminErrorBlock message={fetchError} onRetry={() => void fetchRuns(hours)} />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Mastra Runs"
      description="One row per Mastra run: which provider, what it cost, which stage failed, and whether it was grounded — all keyed by the same runId."
    >
      <MastraRunsToolbar
        hours={hours}
        onHoursChange={setHours}
        onRefresh={() => void fetchRuns(hours)}
      />
      <MastraRunsTable runs={runs} />
    </SettingsSection>
  );
}
