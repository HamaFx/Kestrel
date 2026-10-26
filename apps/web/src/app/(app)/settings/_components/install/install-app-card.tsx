'use client';

// SPDX-License-Identifier: Apache-2.0
//
// Settings card for the install / home-screen surface. Unlike the passive
// nudge this never hides itself: it reports the current installation state and
// always offers whichever install path the platform supports.
import { IconCircleCheck, IconDownload } from '@tabler/icons-react';
import Link from 'next/link';

import { InstallInstructionsCard } from '@/components/layout/install-nudge/install-cards';
import {
  installPlatform,
  instructionsFor,
} from '@/components/layout/install-nudge/platform-instructions';
import { useInstallDetection } from '@/components/layout/install-nudge/use-install-detection';
import { Button } from '@/components/ui/button';

export function InstallAppCard() {
  const { hydrated, installed, canPrompt, promptInstall, displayMode, platform } =
    useInstallDetection({ gate: false });

  if (!hydrated) {
    return <div className="shimmer h-40 rounded-sm" aria-hidden="true" />;
  }

  if (installed) {
    return (
      <section
        aria-label="Installed state"
        className="border-border bg-bg-elev-1 flex items-start gap-3 rounded-sm border p-4"
      >
        <IconCircleCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-fg text-sm font-semibold">Kestrel is installed on this device</p>
          <p className="text-fg-muted text-caption leading-snug">
            Running in <span className="text-fg font-medium">{displayMode}</span> mode. Open it from
            your home screen or app launcher; updates arrive automatically.
          </p>
          <Link
            href="/settings/notifications"
            className="text-brand text-caption mt-1 font-medium underline-offset-4 hover:underline"
          >
            Enable alerts on this device
          </Link>
        </div>
      </section>
    );
  }

  if (canPrompt) {
    return (
      <section
        aria-label="Install Kestrel"
        className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
      >
        <div className="flex flex-col gap-1">
          <p className="text-fg text-sm font-semibold">Install Kestrel on this device</p>
          <p className="text-fg-muted text-caption leading-snug">
            Adds a home-screen or taskbar icon, runs full screen, and keeps the shell available
            offline.
          </p>
        </div>
        <div>
          <Button size="sm" onClick={promptInstall} className="min-h-[44px] gap-2">
            <IconDownload className="size-4" aria-hidden="true" />
            Install
          </Button>
        </div>
      </section>
    );
  }

  const instructions = instructionsFor(installPlatform());
  if (instructions) {
    return <InstallInstructionsCard variant="plain" instructions={instructions} />;
  }

  return (
    <section className="border-border bg-bg-elev-1 rounded-sm border p-4">
      <p className="text-fg text-sm font-semibold">Install from your browser</p>
      <p className="text-fg-muted text-caption mt-1 leading-snug">
        This browser ({platform}) does not expose an install action to the page. Use its own
        “Install” or “Add to Home Screen” menu entry if it has one.
      </p>
    </section>
  );
}
