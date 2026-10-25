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
import { cn } from '@/lib/formatters/cn';

import type { ComposerController } from './use-composer';

export function ComposerMentionMenu({ composer }: { composer: ComposerController }) {
  const { mentionAgents, activeMentionIndex, setMentionIndex, insertMention } = composer;
  if (mentionAgents.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Custom agents"
      className="border-border bg-bg-elev-1 absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-lg border shadow-xl"
    >
      {mentionAgents.map((agent, index) => (
        <button
          key={agent.id}
          type="button"
          role="option"
          aria-selected={index === activeMentionIndex}
          onMouseEnter={() => setMentionIndex(index)}
          onClick={() => insertMention(agent.slug)}
          className={cn(
            'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
            index === activeMentionIndex ? 'bg-bg-elev-2' : 'hover:bg-bg-elev-2/60',
          )}
        >
          <span className="min-w-0">
            <span className="text-fg block text-xs font-semibold">{agent.name}</span>
            <span className="text-fg-subtle block font-mono text-[10px]">@{agent.slug}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
