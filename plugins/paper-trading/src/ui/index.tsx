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

import { definePluginUi } from '@kestrel/plugin-sdk/ui';

import { ClosePositionCard } from './close-position-card';
import { PaperTradingPage } from './paper-page';
import { PaperTradingWidget } from './paper-widget';
import { PlaceOrderCard } from './place-order-card';
import { AccountsCard, PositionsCard } from './positions-card';

const ui = definePluginUi({
  chatToolParts: {
    paper_place_order: { component: PlaceOrderCard },
    paper_list_positions: { component: PositionsCard },
    paper_get_accounts: { component: AccountsCard },
    paper_close_position: { component: ClosePositionCard },
  },
  navItems: [
    {
      href: '/plugins/paper-trading',
      label: 'Paper Trading',
      iconName: 'IconWallet',
      description: 'Virtual accounts, positions & orders',
      match: ['/plugins/paper-trading'],
      order: 25,
    },
  ],
  pages: [{ path: '', component: PaperTradingPage }],
  dashboardWidgets: [
    {
      id: 'paper-accounts',
      title: 'Paper Trading',
      description: 'Equity, open P&L and account utilisation',
      component: PaperTradingWidget,
      defaultSize: 'sm',
    },
  ],
  slashCommands: [
    {
      id: 'paper',
      label: 'Paper Trading',
      description: 'Open the virtual broker desk',
    },
  ],
});

export default ui;
