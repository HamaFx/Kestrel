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

// Parameter-sweep panel.
//
// This barrel keeps the previous `./sweep-panel` import path working; state
// lives in `use-sweep-panel.ts` and each section is its own component.
import { IconAlertTriangle } from '@tabler/icons-react';
import type { z } from 'zod';

import type { StrategySummarySchema } from '../../schemas';
import { SweepControls } from './sweep-controls';
import { SweepDetail } from './sweep-detail';
import { SweepList } from './sweep-list';
import { useSweepPanel } from './use-sweep-panel';

type StrategySummary = z.infer<typeof StrategySummarySchema>;

export function SweepPanel({ strategies }: { strategies: readonly StrategySummary[] }) {
  const panel = useSweepPanel(strategies);

  return (
    <div className="flex flex-col gap-4">
      {panel.error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{panel.error}</span>
        </div>
      ) : null}

      <SweepControls panel={panel} strategies={strategies} />

      <SweepDetail panel={panel} />

      <SweepList panel={panel} />
    </div>
  );
}
