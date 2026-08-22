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
import type { MastraScenarioView } from './mastra-report-schema';

interface MastraReportScenariosProps {
  scenarios: MastraScenarioView[];
}

export function MastraReportScenarios({ scenarios }: MastraReportScenariosProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {scenarios.map((scenario) => {
        const tone =
          scenario.direction === 'bullish'
            ? 'border-bull/30 bg-bull/5'
            : scenario.direction === 'bearish'
              ? 'border-bear/30 bg-bear/5'
              : 'border-border bg-bg-elev-1';
        return (
          <section
            key={`${scenario.name}-${scenario.direction}`}
            className={`rounded-sm border p-3 ${tone}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-fg text-sm font-semibold">{scenario.name}</h4>
              <span className="text-caption text-fg-subtle font-semibold tracking-wide uppercase">
                {scenario.direction}
              </span>
            </div>
            <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
              <div>
                <dt className="text-fg-subtle font-semibold">Trigger</dt>
                <dd className="text-fg-muted">{scenario.trigger}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle font-semibold">Invalidation</dt>
                <dd className="text-fg-muted">{scenario.invalidation}</dd>
              </div>
            </dl>
            {scenario.targets.length > 0 ? (
              <p className="text-fg-muted mt-2 text-xs">
                <span className="text-fg-subtle font-semibold">Targets:</span>{' '}
                {scenario.targets.join(' · ')}
              </p>
            ) : null}
            <p className="text-fg-muted mt-1 text-xs">
              <span className="text-fg-subtle font-semibold">Risks:</span>{' '}
              {scenario.risks.join(' · ')}
            </p>
          </section>
        );
      })}
    </div>
  );
}
