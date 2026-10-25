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

import { TelegramPage } from './telegram-page';
import { TelegramStatusWidget } from './telegram-status-widget';

const ui = definePluginUi({
  navItems: [
    {
      href: '/plugins/telegram-bot',
      label: 'Telegram',
      iconName: 'IconBrandTelegram',
      description: 'Bot, briefings & account link',
      match: ['/plugins/telegram-bot'],
      order: 40,
    },
  ],
  pages: [{ path: '', component: TelegramPage }],
  dashboardWidgets: [
    {
      id: 'telegram-status',
      title: 'Telegram Copilot',
      description: 'Bot link, alert and briefing status',
      component: TelegramStatusWidget,
      defaultSize: 'sm',
    },
  ],
  slashCommands: [
    {
      id: 'telegram',
      label: 'Telegram Copilot',
      description: 'Open the Telegram bot console',
    },
  ],
});

export default ui;
