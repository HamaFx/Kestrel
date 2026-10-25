'use client';

// SPDX-License-Identifier: Apache-2.0

// Anomaly alert list shown above the SLI grid.
import { IconAlertTriangle } from '@tabler/icons-react';

export function AnomalyList({ anomalies }: { anomalies: string[] }) {
  if (anomalies.length === 0) return null;

  return (
    <div className="bg-warn/5 border-warn/25 rounded-sm border p-4">
      <div className="mb-2 flex items-center gap-2">
        <IconAlertTriangle className="text-warn size-4" aria-hidden="true" />
        <h3 className="text-warn text-sm font-semibold">
          {anomalies.length} Anomal{anomalies.length === 1 ? 'y' : 'ies'} Detected
        </h3>
      </div>
      <ul className="space-y-1">
        {anomalies.map((a, i) => (
          <li key={i} className="text-fg-subtle flex items-start gap-1.5 text-xs">
            <span className="text-warn mt-0.5 shrink-0">•</span>
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}
