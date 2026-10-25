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

// Collapsible capability matrix comparing vision/embedding/free tier support
// across every supported BYOK provider.

import { BYOK_PROVIDERS_LIST } from '@kestrel/ai';

export function ProviderCapabilityMatrix() {
  return (
    <details className="surface-panel mt-2 overflow-hidden rounded-xl border border-white/10 shadow-[var(--shadow-chip)]">
      <summary
        aria-label="Toggle provider capability matrix"
        className="hover:bg-bg-elev-2/60 flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors select-none"
      >
        <div className="flex flex-col">
          <span className="text-fg text-sm font-medium">Provider Capability Matrix</span>
          <span className="text-caption text-fg-subtle">
            Compare capabilities (Vision, Embedding, Free tier) across all supported AI providers.
          </span>
        </div>
        <span className="text-caption text-fg-subtle font-mono">▾</span>
      </summary>
      <div className="border-border/50 max-w-full min-w-0 overflow-x-auto border-t p-0">
        <table className="w-full min-w-[500px] border-collapse text-left">
          <thead>
            <tr className="border-border/50 text-caption text-fg-muted bg-bg-elev-2/50 border-b font-semibold">
              <th className="p-3">Provider</th>
              <th className="p-3 text-center">Chat</th>
              <th className="p-3 text-center">Vision</th>
              <th className="p-3 text-center">Embedding</th>
              <th className="p-3 text-center">Streaming</th>
              <th className="p-3 text-center">Tool Calls</th>
              <th className="p-3 text-center">Free Tier</th>
            </tr>
          </thead>
          <tbody className="divide-border/40 text-caption divide-y">
            {BYOK_PROVIDERS_LIST.map((p) => (
              <tr key={p.id} className="hover:bg-bg-elev-2/20">
                <td className="text-fg p-3 font-medium">{p.displayName}</td>
                <td className="text-success p-3 text-center">✓</td>
                <td className="p-3 text-center">
                  {p.supports.vision ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {p.supports.embedding ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className="text-success p-3 text-center">✓</td>
                <td className="text-success p-3 text-center">✓</td>
                <td className="p-3 text-center">
                  {p.pricingTier === 'free' ? (
                    <span className="surface-chip bg-success/15 text-success rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                      Free
                    </span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
