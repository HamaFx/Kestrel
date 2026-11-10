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
import { PLUGIN_UI_CLASSES } from '@kestrel/plugin-sdk/ui';

export function CommandReference() {
  return (
    <section data-slot="frame" className={PLUGIN_UI_CLASSES.frame}>
      <div data-slot="frame-header" className={PLUGIN_UI_CLASSES.frameHeader}>
        <h3 data-slot="frame-title" className={PLUGIN_UI_CLASSES.frameTitle}>
          Command Reference
        </h3>
      </div>
      <div
        data-slot="frame-panel"
        className={`${PLUGIN_UI_CLASSES.framePanel} grid grid-cols-1 gap-2 sm:grid-cols-2`}
      >
        {[
          ['/price XAUUSD', 'Live bid / ask'],
          ['/analyze XAUUSD full', '4-desk AI analysis'],
          ['/ask <question>', 'Free-form market question'],
          ['/committee XAUUSD', '4-desk AI committee'],
          ['/news', 'Latest headlines'],
          ['/calendar', 'Upcoming events'],
          ['/positions', 'Open positions & P&L'],
          ['/alert XAUUSD > 2700', 'Create a price alert'],
          ['/briefing', 'Send the briefing now'],
          ['/mute /unmute', 'Pause alert notifications'],
        ].map(([command, description]) => (
          <div
            key={command}
            className="surface-well border-border/60 flex flex-col gap-0.5 rounded-lg border p-3"
          >
            <code className="text-fg font-mono text-xs">{command}</code>
            <span className="text-fg-subtle text-xs">{description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
