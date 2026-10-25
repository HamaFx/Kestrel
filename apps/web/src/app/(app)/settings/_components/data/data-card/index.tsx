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

// Data & cache card — local-storage management. The personal app keeps
// bookmarks and prefs in localStorage; this card lets the user clear
// individual keys or wipe everything stored on this device.
import { IconDatabase } from '@tabler/icons-react';

import { DataActionsSection } from './data-actions-section';
import { DeleteAccountZone } from './delete-account-zone';

export function DataCard() {
  return (
    <section
      aria-labelledby="data-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-cyan-400">
            <IconDatabase className="size-4" />
          </div>
          <div>
            <h2 id="data-heading" className="text-fg text-sm font-semibold tracking-tight">
              Storage & Cache Management
            </h2>
            <p className="text-fg-subtle text-xs">
              Local data retention, thread history, and privacy exports
            </p>
          </div>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Client & Server
        </span>
      </header>

      <DataActionsSection />

      <DeleteAccountZone />
    </section>
  );
}
