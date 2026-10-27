// SPDX-License-Identifier: Apache-2.0

// Desk persona labels + icons for the convene_committee renderer. Persona copy
// is derived from the canonical strategist registry; only the icons (which
// cannot be expressed as data) are mapped locally.

import {
  IconAlertTriangle,
  IconBriefcase,
  IconRadar,
  IconTrendingUp,
  type Icon,
} from '@tabler/icons-react';

import { resolveStrategistDesk } from '@/lib/kestrel-strategist-desks';

const PERSONA_ICONS: Record<string, Icon> = {
  desk1: IconBriefcase,
  desk2: IconTrendingUp,
  desk3: IconAlertTriangle,
  desk4: IconRadar,
};

/** Icon key per canonical desk id — order mirrors `FOUR_SPECIALIST_DESKS`. */
const DESK_ICON_KEYS: Record<string, string> = {
  fundamental: 'desk1',
  technical: 'desk2',
  risk: 'desk3',
  sentiment: 'desk4',
};

export const PERSONA_LABELS: Record<
  string,
  { label: string; code: string; epithet: string; Icon: Icon }
> = (() => {
  const labels: Record<string, { label: string; code: string; epithet: string; Icon: Icon }> = {};
  // Historical persona keys the committee tool has emitted (`economist`,
  // `technician`, `risk_manager`, `sentiment`) plus the canonical ids.
  const keys = [
    'economist',
    'technician',
    'risk_manager',
    'sentiment',
    'fundamental',
    'technical',
    'risk',
    'flow',
  ];
  for (const key of keys) {
    const desk = resolveStrategistDesk(key);
    labels[key] = {
      label: desk.title,
      code: desk.code,
      epithet: desk.epithet,
      Icon: PERSONA_ICONS[DESK_ICON_KEYS[desk.id] ?? 'desk1'] ?? IconBriefcase,
    };
  }
  return labels;
})();
