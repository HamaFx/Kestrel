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

/**
 * <InstallNudge> — PWA install affordance.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 12.
 *
 * Behaviour:
 *   - Chrome / Edge / Android: listens for `beforeinstallprompt`,
 *     stashes the event, renders a one-click "Install Kestrel"
 *     button. Tapping the button calls `event.prompt()` and waits
 *     for the user's choice.
 *   - iOS Safari: no native install prompt. We detect iOS without
 *     standalone mode and show a text instruction: "Tap IconShare →
 *     Add to Home Screen".
 *   - Already installed (standalone mode): nothing rendered.
 *   - User dismisses three times: stop showing (cap in localStorage).
 *   - SSR-safe: all checks live in useEffect.
 */
import { BrowserInstallPrompt, IosInstallHint } from './install-cards';
import { useInstallDetection } from './use-install-detection';

export function InstallNudge() {
  const { hydrated, deferred, installed, isIOS, dismissed, onInstall, onDismiss } =
    useInstallDetection();

  if (!hydrated || installed || dismissed) return null;

  // iOS path: text instruction.
  if (isIOS) {
    return <IosInstallHint onDismiss={onDismiss} />;
  }

  // Chrome / Edge / Android path: deferred prompt button.
  if (deferred) {
    return <BrowserInstallPrompt onInstall={onInstall} onDismiss={onDismiss} />;
  }

  return null;
}
