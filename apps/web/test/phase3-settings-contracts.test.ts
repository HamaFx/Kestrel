// @vitest-environment node
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

// Phase 3 Task 2 source contracts for the personal BYOK settings surface.
//
// The routes are RSC pages wired to auth/session + DB, so the regression risk
// worth locking is structural: an `isAdmin` redirect quietly returning, the
// budget form dropping off `/settings/usage`, the fake locale selector coming
// back, or the notifications page resurrecting the operator-only Telegram
// test button. Grep-level contracts are the honest way to assert those.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

const AI_PAGES = [
  'apps/web/src/app/(app)/settings/api-keys/page.tsx',
  'apps/web/src/app/(app)/settings/models/page.tsx',
  'apps/web/src/app/(app)/settings/agent/page.tsx',
];

describe('Personal BYOK settings surface (Phase 3)', () => {
  it('never redirects a signed-in non-admin away from the AI settings pages', () => {
    for (const page of AI_PAGES) {
      const source = read(page);
      expect(source).not.toContain("redirect('/settings')");
      expect(source).not.toMatch(/if\s*\(!isAdmin\)\s*\{?\s*redirect/);
    }
  });

  it('mounts the spend-guardrail form on /settings/usage with personal budgets', () => {
    const usage = read('apps/web/src/app/(app)/settings/usage/page.tsx');

    expect(usage).toContain('<UsageLimitsForm');
    expect(usage).toContain('monthlyBudgetLimit');
    expect(usage).toContain('spendAlertsConfig');
    expect(usage).toContain('providerSpendingThresholds');
  });

  it('reads the BYOK vault from the user’s own settings row, not the inherited one', () => {
    const apiKeys = read('apps/web/src/app/(app)/settings/api-keys/page.tsx');

    expect(apiKeys).toContain('getOwnUserSettings');
    expect(apiKeys).toContain('ownSettings?.aiApiKeys');
  });

  it('replaces the fake locale selector with a static badge', () => {
    const appearance = read(
      'apps/web/src/app/(app)/settings/_components/appearance/appearance-card.tsx',
    );

    expect(appearance).not.toContain('<select');
    expect(appearance).not.toContain('updateLocaleAction');
    expect(appearance).toContain('English (US');
  });

  it('routes Telegram setup to the Telegram Copilot plugin', () => {
    const notifications = read('apps/web/src/app/(app)/settings/notifications/page.tsx');

    expect(notifications).toContain('href="/plugins/telegram-bot"');
    expect(notifications).not.toContain('TestTelegramButton');
    expect(notifications).not.toContain('TELEGRAM_CHAT_ID');
  });
});
