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

export function CommandReference() {
  return (
    <section className="surface-panel rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <h3 className="text-fg text-sm font-semibold">Command reference</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          ['/price XAUUSD', 'Live bid / ask'],
          ['/analyze XAUUSD full', '4-desk AI analysis'],
          ['/ask <question>', 'Free-form market question'],
          ['/committee XAUUSD', 'Full team debate'],
          ['/news', 'Latest headlines'],
          ['/calendar', 'Upcoming events'],
          ['/positions', 'Open positions & P&L'],
          ['/alert XAUUSD > 2700', 'Create a price alert'],
          ['/briefing', 'Send the briefing now'],
          ['/mute /unmute', 'Pause alert notifications'],
        ].map(([command, description]) => (
          <div
            key={command}
            className="border-border/50 bg-bg-elev-1/40 flex flex-col gap-0.5 rounded-md border p-2.5"
          >
            <code className="text-fg font-mono text-xs">{command}</code>
            <span className="text-fg-subtle text-[11px]">{description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
