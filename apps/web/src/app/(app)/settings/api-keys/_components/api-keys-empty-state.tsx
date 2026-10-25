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

// Empty state shown when no BYOK providers are configured yet.

import { IconKey } from '@tabler/icons-react';

export function ApiKeysEmptyState() {
  return (
    <div className="surface-panel flex flex-col items-center gap-3 rounded-xl border border-white/10 p-6 text-center shadow-[var(--shadow-chip)]">
      <div className="surface-well text-fg-subtle flex size-12 items-center justify-center rounded-xl border border-white/5 shadow-inner">
        <IconKey className="text-brand size-6" />
      </div>
      <div>
        <h3 className="text-fg text-sm font-semibold">No API keys configured yet</h3>
        <p className="text-caption text-fg-subtle mt-1 max-w-md">
          Pick a provider below and paste your API key. The free tier (Google Gemini or Groq) is a
          good starting point — the chat works as soon as one key is saved.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <span className="surface-chip bg-success/15 text-caption text-success rounded-md px-2.5 py-1 font-mono font-medium">
          Google Gemini · free
        </span>
        <span className="surface-chip bg-success/15 text-caption text-success rounded-md px-2.5 py-1 font-mono font-medium">
          Groq · free
        </span>
        <span className="surface-chip bg-bg-elev-2 text-caption text-fg-subtle rounded-md px-2.5 py-1 font-mono font-medium">
          + 7 paid options
        </span>
      </div>
    </div>
  );
}
