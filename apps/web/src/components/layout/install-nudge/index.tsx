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

// SPDX-License-Identifier: Apache-2.0

/**
 * <InstallNudge> — the in-app "Add Kestrel to your home screen" affordance.
 *
 * Rules (docs/pwa.md §install):
 *   - Nothing to say when the app is already installed or the user opted out.
 *   - The engagement gate + progressive snooze live in the hook; this component
 *     only decides *which* card to show.
 *   - Chromium gets a real `beforeinstallprompt` button; iOS, macOS Safari and
 *     browsers without the API get numbered instructions instead.
 *   - Never shown on /chat: the composer owns that screen and an install banner
 *     above it costs vertical space on every message.
 *   - `/settings/install` always offers the same surface on demand, so a
 *     dismissal is never a dead end.
 */
import { useShellRoute } from '@/components/layout/shell-route-context';

import { InstallInstructionsCard, InstallPromptCard } from './install-cards';
import { installPlatform, instructionsFor } from './platform-instructions';
import { useInstallDetection } from './use-install-detection';

export function InstallNudge() {
  const { hydrated, installed, canPrompt, offerable, promptInstall, dismiss } =
    useInstallDetection();
  const { isChat, pathname } = useShellRoute();

  // The composer owns /chat, and /settings/install is the explicit install
  // surface that already renders the same card.
  if (!hydrated || installed || !offerable || isChat) return null;
  if (pathname.startsWith('/settings/install')) return null;

  if (canPrompt) {
    return <InstallPromptCard onInstall={promptInstall} onDismiss={dismiss} />;
  }

  // Without a deferred prompt, only platforms that *never* fire one get
  // instructions. On Chromium a missing event means the browser has decided the
  // app is not installable (or the user already said no) — stay quiet there and
  // let /settings/install do the explaining on demand.
  const platformId = installPlatform();
  const instructions =
    platformId === 'ios' || platformId === 'macos-safari' ? instructionsFor(platformId) : null;
  if (!instructions) return null;

  return <InstallInstructionsCard instructions={instructions} onDismiss={dismiss} />;
}
