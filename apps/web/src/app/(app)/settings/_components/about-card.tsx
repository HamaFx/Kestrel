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

import { IconLogout } from '@tabler/icons-react';

import { LogoutButton } from './logout-button';
import { SettingsRow } from './settings-row';

export async function AboutCard() {
  return (
    <section
      aria-labelledby="about-heading"
      className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <h2 id="about-heading" className="text-fg text-sm font-semibold tracking-tight">
          Account Session
        </h2>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium">
          Kestrel Cloud
        </span>
      </header>

      <SettingsRow
        icon={<IconLogout className="text-danger size-4" />}
        label="Sign out"
        description="Sign out of your Kestrel account on this device"
        action={<LogoutButton />}
      />

      <div className="surface-well text-fg-subtle mt-2 flex flex-col gap-1 rounded-xl border border-white/5 p-3.5 font-mono text-[11px] shadow-inner">
        <p className="text-fg font-semibold">Kestrel AI Market Copilot</p>
        <p className="text-fg-subtle/80">
          4-desk AI market research, real-time alerts, and trade journaling for Gold, Forex, and
          Crypto.
        </p>
      </div>
    </section>
  );
}
