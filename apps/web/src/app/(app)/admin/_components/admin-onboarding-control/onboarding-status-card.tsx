'use client';

// SPDX-License-Identifier: Apache-2.0

// Inspected-onboarding record card with the reset action.
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { OnboardingInspectDTO } from '@/lib/services/admin-dtos';

interface OnboardingStatusCardProps {
  status: OnboardingInspectDTO;
  fullReset: boolean;
  resetting: boolean;
  onFullResetChange: (value: boolean) => void;
  onReset: () => void;
}

export function OnboardingStatusCard({
  status,
  fullReset,
  resetting,
  onFullResetChange,
  onReset,
}: OnboardingStatusCardProps) {
  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">User ID</span>
        <span className="text-fg-subtle font-mono text-sm break-all">{status.userId}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">Status</span>
        <Badge tone={status.onboardingCompleted ? 'success' : 'warn'}>
          {status.onboardingCompleted ? 'Completed' : 'Not completed'}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">Language</span>
        <span className="text-fg-subtle text-sm">{status.userSettings.language ?? '—'}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">Default symbol</span>
        <span className="text-fg-subtle text-sm">{status.userSettings.defaultSymbol ?? '—'}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">Timezone</span>
        <span className="text-fg-subtle text-sm">{status.userSettings.timezone ?? '—'}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">Watchlist</span>
        <span className="text-fg-subtle text-sm">
          {status.watchlist.length > 0 ? status.watchlist.join(', ') : '—'}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fg text-sm font-semibold">Custom API Overrides</span>
        <span className="text-fg-subtle text-sm">
          {status.hasApiKeys ? status.apiProviders.join(', ') : 'None configured'}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Switch checked={fullReset} onCheckedChange={onFullResetChange} srLabel="Full reset mode" />
        <span className="text-fg text-sm">Full reset (clears watchlist and preferences)</span>
      </div>

      <Button variant="danger" loading={resetting} onClick={onReset}>
        Reset Onboarding
      </Button>
    </div>
  );
}
