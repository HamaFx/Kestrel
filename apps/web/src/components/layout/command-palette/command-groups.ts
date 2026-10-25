// SPDX-License-Identifier: Apache-2.0
// Group labels/order and the ranked row shape shared by the palette registry
// hook and the result list.

import type { CommandGroup, CommandItem } from '@/lib/commands';

export const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: 'Navigate',
  create: 'Create',
  plugins: 'Plugins',
  settings: 'Settings',
};

export const GROUP_ORDER: CommandGroup[] = ['navigation', 'create', 'plugins', 'settings'];

export interface CommandRow {
  command: CommandItem;
  labelIndices: number[];
}
