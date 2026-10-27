// SPDX-License-Identifier: Apache-2.0

// Desk identities for the 4-Desk AI Research Committee: copy is derived from
// the canonical strategist registry; only the Tailwind badge/glow classes are
// mapped locally (they cannot be built dynamically).

import {
  FOUR_SPECIALIST_DESKS,
  type CanonicalDeskId,
  type StrategistDeskConfig,
} from '@/lib/kestrel-strategist-desks';

export type DeskId = CanonicalDeskId;

export interface CharacterProfile {
  id: DeskId;
  name: string;
  role: string;
  badgeClass: string;
  glowColor: string;
  title: string;
  specialty: string;
  indicators: string;
  motto: string;
  artworkPath: string;
  accentColor: string;
}

const DESK_STYLES: Record<DeskId, { badgeClass: string; glowColor: string }> = {
  technical: {
    badgeClass: 'text-bull border-bull/30 bg-bull/10',
    glowColor: 'rgba(63, 158, 61, 0.14)',
  },
  fundamental: {
    badgeClass: 'text-info border-info/30 bg-info/10',
    glowColor: 'rgba(79, 163, 181, 0.14)',
  },
  risk: { badgeClass: 'text-warn border-warn/30 bg-warn/10', glowColor: 'rgba(217, 143, 0, 0.14)' },
  sentiment: {
    badgeClass: 'text-brand border-brand/30 bg-brand/10',
    glowColor: 'rgba(255, 54, 22, 0.14)',
  },
};

function profileFromRegistry(desk: StrategistDeskConfig, index: number): CharacterProfile {
  const id = desk.id as DeskId;
  const styles = DESK_STYLES[id];
  return {
    id,
    name: desk.title.replace(/ Desk$/, ''),
    role: `Desk ${String(index + 1).padStart(2, '0')} · ${desk.roleTag}`,
    badgeClass: styles.badgeClass,
    glowColor: styles.glowColor,
    title: desk.domainMetrics,
    specialty: desk.description,
    indicators: desk.domainMetrics,
    motto: desk.motto,
    artworkPath: desk.artworkPath,
    accentColor: desk.accentColor,
  };
}

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = Object.fromEntries(
  FOUR_SPECIALIST_DESKS.map((desk, index) => [desk.id, profileFromRegistry(desk, index)]),
);

export const DESK_ORDER: DeskId[] = FOUR_SPECIALIST_DESKS.map((desk) => desk.id as DeskId);

/** Compact chip labels used by the standby desk matrix. */
export const DESK_SHORT_LABELS: Record<DeskId, string> = Object.fromEntries(
  FOUR_SPECIALIST_DESKS.map((desk) => [desk.id, desk.chipLabel]),
) as Record<DeskId, string>;
