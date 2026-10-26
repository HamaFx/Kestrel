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

import type { Metadata } from 'next';

import { InstallAppCard } from '../_components/install/install-app-card';

export const metadata: Metadata = {
  title: 'Install app · Settings',
  description: 'Add Kestrel to your home screen or dock, and enable alerts on this device.',
};

export default function InstallSettingsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Install app</h2>
        <p className="text-fg-subtle text-sm">
          Run Kestrel as an app on this device: full screen, one tap away, offline shell included.
        </p>
      </div>

      <InstallAppCard />

      <section className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-sm border p-4">
        <h3 className="text-fg text-sm font-semibold">What installing adds</h3>
        <ul className="text-fg-muted text-caption flex list-disc flex-col gap-1.5 pl-4 leading-snug">
          <li>A home-screen or taskbar icon that opens the full workspace, not a browser tab.</li>
          <li>
            The cached app shell, which means the offline screen and static assets load instantly.
          </li>
          <li>
            Alert delivery on this device — on iPhone and iPad, notifications only work once Kestrel
            is on the Home Screen.
          </li>
          <li>
            On iOS the installed app keeps its own storage, so you may need to sign in once after
            installing.
          </li>
        </ul>
      </section>
    </div>
  );
}
