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
      className="surface-panel border-border bg-surface-panel flex flex-col gap-1 rounded-xl border p-4 shadow-sm"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2 id="about-heading" className="text-fg text-base font-semibold tracking-tight">
          About
        </h2>
      </header>

      <SettingsRow
        icon={<IconLogout className="size-4" />}
        label="Sign out"
        description="Clears the password cookie on this device"
        action={<LogoutButton />}
      />

      {/* Footer — build id + a tiny credit line. Helps debug bug reports
          when the user can name the exact build they're on. */}
      <div className="border-border text-caption -mx-4 mt-2 flex flex-col gap-1 border-t px-4 pt-3">
        <p className="text-fg-subtle tabular-nums">Build {buildId ?? 'unknown'}</p>
        <p className="text-fg-subtle/70">Gold · forex · crypto — personal copilot</p>
      </div>
    </section>
  );
}
