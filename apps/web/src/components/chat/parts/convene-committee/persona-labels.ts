// SPDX-License-Identifier: Apache-2.0

// Desk persona labels + icons for the convene_committee renderer.

import {
  IconAlertTriangle,
  IconBriefcase,
  IconRadar,
  IconTrendingUp,
  type Icon,
} from '@tabler/icons-react';

export const PERSONA_LABELS: Record<
  string,
  { label: string; code: string; epithet: string; Icon: Icon }
> = {
  economist: {
    label: 'Macro & Rates Desk',
    code: 'DESK-I // HORUS',
    epithet: 'The All-Seeing Horizon',
    Icon: IconBriefcase,
  },
  technician: {
    label: 'Technical Structure Desk',
    code: 'DESK-II // ASTROLABE',
    epithet: 'The Mathematical Compass',
    Icon: IconTrendingUp,
  },
  risk_manager: {
    label: 'Risk & Sizing Desk',
    code: 'DESK-III // HOPLITE',
    epithet: 'The Impassable Shield',
    Icon: IconAlertTriangle,
  },
  sentiment: {
    label: 'Flow & Sentiment Desk',
    code: 'DESK-IV // COUNCIL',
    epithet: 'Whale Positioning',
    Icon: IconRadar,
  },
};
