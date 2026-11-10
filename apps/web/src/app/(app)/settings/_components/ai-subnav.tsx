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
import { PillarSubNav } from '@/components/layout/market-subnav';

import { ACCOUNT_TABS, AI_TABS, TRADING_TABS } from './settings-subnav-tabs';

export function AISubNav() {
  return (
    <PillarSubNav
      ariaLabel="AI & Intelligence Sections"
      layoutId="settings-ai-subnav-pill"
      tabs={AI_TABS}
      className="max-md:hidden"
    />
  );
}

export function TradingSubNav() {
  return (
    <PillarSubNav
      ariaLabel="Trading & Alerts Sections"
      layoutId="settings-trading-subnav-pill"
      tabs={TRADING_TABS}
      className="max-md:hidden"
    />
  );
}

export function AccountSubNav() {
  return (
    <PillarSubNav
      ariaLabel="Account & System Sections"
      layoutId="settings-account-subnav-pill"
      tabs={ACCOUNT_TABS}
      className="max-md:hidden"
    />
  );
}
