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

// F4 — Noise Control Settings Card
//
// Client component for configuring notification noise control:
// quiet hours, min severity, cooldown, dedup TTL, and daily digest mode.
import type { NoiseConfig } from '@kestrel/shared';

import { DigestPreviewPanel } from './digest-preview';
import { NoiseRuleList } from './noise-rule-list';
import { useNoiseConfig } from './use-noise-config';

export function NoiseControlCard({ initialConfig }: { initialConfig?: NoiseConfig | null }) {
  const { config, saving, preview, previewLoading, update } = useNoiseConfig(initialConfig);

  return (
    <section
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
      aria-labelledby="noise-control-heading"
    >
      <div className="flex items-center gap-3 pb-2">
        <h2 id="noise-control-heading" className="text-fg text-base font-semibold tracking-tight">
          Notification noise control
        </h2>
        {saving && <span className="text-fg-muted font-mono text-xs">Saving…</span>}
      </div>

      <p className="text-fg-subtle text-sm">
        Reduce notification fatigue with dedup, cooldown, quiet hours, and severity filtering.
      </p>

      {/* Alert Preview */}
      {preview && <DigestPreviewPanel preview={preview} previewLoading={previewLoading} />}

      <NoiseRuleList config={config} update={update} />
    </section>
  );
}
