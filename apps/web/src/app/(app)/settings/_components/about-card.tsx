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

// About card — sign-out + a small "what's running" footer with build id.
// Server component.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { IconLogout } from '@tabler/icons-react';

import { LogoutButton } from './logout-button';
import { SettingsRow } from './settings-row';

let _buildId: string | null | undefined;
function getBuildId(): string | null {
  if (_buildId === undefined) {
    try {
      const file = path.join(process.cwd(), '.build-id');
      const text = readFileSync(file, 'utf-8');
      _buildId = text.trim() || null;
    } catch {
      _buildId = null;
    }
  }
  return _buildId;
}

export async function AboutCard() {
  const buildId = getBuildId();

  return (
    <section
      aria-labelledby="about-heading"
      className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <h2 id="about-heading" className="text-fg text-sm font-semibold tracking-tight">
          Session & Runtime
        </h2>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium">
          Build {buildId ?? '2026.4'}
        </span>
      </header>

      <SettingsRow
        icon={<IconLogout className="size-4 text-danger" />}
        label="Sign out"
        description="Terminates authenticated session cookie on this client device"
        action={<LogoutButton />}
      />

      {/* Footer — build id + platform info */}
      <div className="surface-well mt-2 flex flex-col gap-1 rounded-xl border border-white/5 p-3.5 font-mono text-[11px] shadow-inner text-fg-subtle">
        <p className="font-semibold text-fg">Kestrel AI Market Intelligence</p>
        <p className="text-fg-subtle/80">Autonomous multi-agent research workspace for precious metals, forex, and digital assets.</p>
      </div>
    </section>

  );
}
