// SPDX-License-Identifier: Apache-2.0

// Desk persona labels + icons for the convene_committee renderer.

import {
  IconAlertTriangle,
  IconBriefcase,
  IconRadar,
  IconTrendingUp,
  type Icon,
} from '@tabler/icons-react';

export const PERSONA_LABELS: Record<string, { label: string; Icon: Icon }> = {
  economist: { label: 'Macro & Rates Desk', Icon: IconBriefcase },
  technician: { label: 'Technical Structure Desk', Icon: IconTrendingUp },
  risk_manager: { label: 'Risk & Sizing Desk', Icon: IconAlertTriangle },
  sentiment: { label: 'Flow & Sentiment Desk', Icon: IconRadar },
};
