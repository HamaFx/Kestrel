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

// Account lifecycle and snapshots.

import {
  findAccountByMode,
  getAccount,
  listAccounts,
  listPositions,
  resetAccount,
  seedAccount,
  updateAccountSettings,
} from '../db/queries';
import type { PaperAccountRow } from '../db/tables';
import type { AccountView } from '../schemas';
import type { PaperSettings } from '../settings';
import { accountView } from './views';

export interface SeededAccounts {
  personal: PaperAccountRow;
  sandbox: PaperAccountRow;
}

/**
 * Idempotently seed the two accounts promised by the install UX:
 *   Personal Demo — $100k, every order needs approval.
 *   AI Agent Sandbox — $50k, agents trade autonomously.
 */
export async function ensurePaperAccounts(
  userId: string,
  settings: PaperSettings,
): Promise<SeededAccounts> {
  const [personal, sandbox] = await Promise.all([
    seedAccount({
      userId,
      name: 'Personal Demo',
      mode: 'confirm',
      initialBalance: settings.defaultPersonalBalance,
      leverage: settings.defaultLeverage,
      riskPerTradePct: settings.defaultRiskPct,
    }),
    seedAccount({
      userId,
      name: 'AI Agent Sandbox',
      mode: 'autonomous_sandbox',
      initialBalance: settings.defaultSandboxBalance,
      leverage: settings.defaultLeverage,
      riskPerTradePct: settings.defaultRiskPct,
    }),
  ]);
  return { personal, sandbox };
}

/** Resolve an account by id, `personal`, or `sandbox`. */
export async function resolvePaperAccount(
  userId: string,
  ref: string,
  settings: PaperSettings,
): Promise<PaperAccountRow> {
  const key = ref.trim().toLowerCase();
  if (key === 'personal' || key === 'personal-demo' || key === 'confirm') {
    const account = await findAccountByMode(userId, 'confirm');
    if (account) return account;
    return (await ensurePaperAccounts(userId, settings)).personal;
  }
  if (key === 'sandbox' || key === 'agent' || key === 'autonomous_sandbox') {
    const account = await findAccountByMode(userId, 'autonomous_sandbox');
    if (account) return account;
    return (await ensurePaperAccounts(userId, settings)).sandbox;
  }

  await ensurePaperAccounts(userId, settings);
  const account = await getAccount(userId, ref);
  if (!account) {
    throw new Error(`Paper account "${ref}" was not found. Use "personal" or "sandbox".`);
  }
  return account;
}

export async function listAccountViews(
  userId: string,
  settings: PaperSettings,
): Promise<AccountView[]> {
  await ensurePaperAccounts(userId, settings);
  const [accounts, open] = await Promise.all([
    listAccounts(userId),
    listPositions(userId, { status: 'open', limit: 100 }),
  ]);
  const grouped = new Map<string, typeof open>();
  for (const position of open) {
    const list = grouped.get(position.accountId) ?? [];
    list.push(position);
    grouped.set(position.accountId, list);
  }
  return accounts.map((account) => accountView(account, grouped.get(account.id) ?? []));
}

export async function accountViewById(
  userId: string,
  account: PaperAccountRow,
): Promise<AccountView> {
  const open = await listPositions(userId, {
    accountId: account.id,
    status: 'open',
    limit: 100,
  });
  return accountView(account, open);
}

export async function updateAccountForUser(
  userId: string,
  ref: string,
  settings: PaperSettings,
  patch: { riskPerTradePct?: number; leverage?: number },
): Promise<{ account: PaperAccountRow; view: AccountView }> {
  const account = await resolvePaperAccount(userId, ref, settings);
  const updated = await updateAccountSettings(userId, account.id, patch);
  const row = updated ?? account;
  return { account: row, view: await accountViewById(userId, row) };
}

export async function resetAccountForUser(
  userId: string,
  ref: string,
  settings: PaperSettings,
): Promise<AccountView> {
  const account = await resolvePaperAccount(userId, ref, settings);
  const reset = await resetAccount(userId, account.id);
  const row = reset ?? account;
  return accountViewById(userId, row);
}

/** Used by the tools' dynamic approval check. Fails closed on any error. */
export async function accountModeForRef(
  userId: string,
  ref: string,
  settings: PaperSettings,
): Promise<'confirm' | 'autonomous_sandbox'> {
  const account = await resolvePaperAccount(userId, ref, settings);
  return account.mode === 'autonomous_sandbox' ? 'autonomous_sandbox' : 'confirm';
}
