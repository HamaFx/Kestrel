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

// Maps a plugin's declarative `iconName` to a bundled Tabler icon. Using a
// closed map keeps icons tree-shakeable and avoids runtime dynamic imports.
import {
  IconActivity,
  IconBolt,
  IconBox,
  IconBrain,
  IconBrandTelegram,
  IconChartCandle,
  IconChartLine,
  IconCpu,
  IconDatabase,
  IconFlask,
  IconMessageCircle,
  IconPlug,
  IconPuzzle,
  IconRobot,
  IconRocket,
  IconShield,
  IconSparkles,
  IconUsersGroup,
  IconWallet,
  IconWorld,
  type Icon,
} from '@tabler/icons-react';

const ICONS: Record<string, Icon> = {
  IconActivity,
  IconBolt,
  IconBox,
  IconBrain,
  IconBrandTelegram,
  IconChartCandle,
  IconChartLine,
  IconCpu,
  IconDatabase,
  IconFlask,
  IconMessageCircle,
  IconPlug,
  IconPuzzle,
  IconRobot,
  IconRocket,
  IconShield,
  IconSparkles,
  IconUsersGroup,
  IconWallet,
  IconWorld,
};

/** Resolve a plugin's tabler icon name without dynamic imports. */
export function pluginIcon(iconName: string | undefined): Icon {
  if (!iconName) return IconPuzzle;
  return ICONS[iconName] ?? IconPuzzle;
}
