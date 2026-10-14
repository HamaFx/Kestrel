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

import { sleep } from 'k6';
import { browser } from 'k6/browser';

import { env, type SessionCtx } from '../config/environments.js';

export async function browserCockpit(ctx: SessionCtx): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    if (ctx.cookies) {
      const cookiesToAdd = Object.entries(ctx.cookies).map(([name, value]) => ({
        name,
        value,
        domain: 'localhost',
        path: '/',
      }));
      await context.addCookies(cookiesToAdd);
    }

    await page.goto(`${env.baseUrl}/chart`, { waitUntil: 'networkidle' });
    sleep(1);
  } finally {
    await page.close();
    await context.close();
  }
}
