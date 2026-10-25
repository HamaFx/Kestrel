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
import {
  CitationWarningPartSchema,
  FallbackPartSchema,
  MemoryDegradedPartSchema,
  MutationDraftPayloadSchema,
  StreamToolPartSchema,
  UserPlanPartSchema,
  VerifyWarningPartSchema,
} from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { memo, type ReactNode } from 'react';

import {
  citationWarningFromVerify,
  findEvidenceReplacement,
  malformedFallback,
  toPartState,
} from './message-parts';
import { ActivityRollup } from './parts/activity-rollup';
import { CitationWarningPartView } from './parts/citation-warning';
import { FallbackPartView } from './parts/fallback';
import { MastraReportPart } from './parts/mastra-report';
import { MemoryDegradedPartView } from './parts/memory-degraded';
import { MutationConfirmationCard } from './parts/mutation-confirmation';
import { PlanPart } from './parts/plan';
import { ChatToolPart, type ToolPartState } from './parts/registry';
import { TextPart } from './parts/text';

export function renderMessageParts(
  parts: UIMessage['parts'],
  isStreaming: boolean | undefined,
  role: UIMessage['role'],
): ReactNode[] {
  const elements: ReactNode[] = [];
  const evidenceReplacement = findEvidenceReplacement(parts);
  let replacedTextRendered = false;
  let currentToolGroup: Array<{
    key: number;
    name: string;
    output: unknown;
    state: ToolPartState;
    errorMessage?: string;
  }> = [];

  function flushToolGroup() {
    if (currentToolGroup.length === 0) return;
    const tools = [...currentToolGroup];
    const first = tools[0];
    if (!first) return;
    const isAnyLoading = tools.some((t) => t.state === 'loading');
    elements.push(
      <ActivityRollup
        key={`tools-group-${first.key}`}
        toolCount={tools.length}
        isRunning={isAnyLoading}
        defaultOpen={isAnyLoading}
      >
        {tools.map((t) => (
          <MemoizedToolPart
            key={t.key}
            name={t.name}
            output={t.output}
            state={t.state}
            errorMessage={t.errorMessage}
          />
        ))}
      </ActivityRollup>,
    );
    currentToolGroup = [];
  }

  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    if (!part) continue;
    if (part.type === 'text') {
      flushToolGroup();
      if (evidenceReplacement !== null) {
        if (!replacedTextRendered) {
          replacedTextRendered = true;
          elements.push(
            <MemoizedTextPart
              key={idx}
              text={evidenceReplacement}
              role={role === 'user' ? 'user' : 'assistant'}
              isStreaming={false}
            />,
          );
        }
        continue;
      }
      elements.push(
        <MemoizedTextPart
          key={idx}
          text={part.text}
          role={role === 'user' ? 'user' : 'assistant'}
          isStreaming={!!isStreaming}
        />,
      );
    } else if (part.type.startsWith('tool-')) {
      const toolParse = StreamToolPartSchema.safeParse(part);
      if (toolParse.success) {
        const p = toolParse.data;
        const name = part.type.slice('tool-'.length);
        const streamState = p.state ?? 'output-available';
        const errorMessage = p.errorText;
        currentToolGroup.push({
          key: idx,
          name,
          output: p.output ?? null,
          state: toPartState(streamState),
          errorMessage,
        });
      }
    } else {
      flushToolGroup();
      elements.push(renderPart(part, idx, role));
    }
  }
  flushToolGroup();
  if (evidenceReplacement !== null && !replacedTextRendered) {
    elements.push(
      <MemoizedTextPart
        key="evidence-replaced-text"
        text={evidenceReplacement}
        role={role === 'user' ? 'user' : 'assistant'}
        isStreaming={false}
      />,
    );
  }
  return elements;
}

function renderPart(
  part: UIMessage['parts'][number],
  idx: number,
  _role: UIMessage['role'],
): ReactNode {
  if (part.type === 'reasoning' || part.type === 'data-evidence-blocked') return null;
  if (part.type.startsWith('source-') || part.type === 'file' || part.type === 'step-start')
    return null;

  // Phase 7c — UI-only parts written into the assistant message after
  // streamText finishes (citation warning, verify warning) or written
  // into a sibling system message before the turn (data-plan, handled
  // at the message level above).
  if (part.type === 'data-multi-agent-meta' && 'data' in part) {
    return <MastraReportPart key={idx} data={(part as { data?: unknown }).data} />;
  }
  if (part.type === 'data-mutation-confirmation' && 'data' in part) {
    const parsed = MutationDraftPayloadSchema.safeParse((part as { data?: unknown }).data);
    if (!parsed.success) {
      return <FallbackPartView key={idx} part={malformedFallback('mutation confirmation')} />;
    }
    return <MutationConfirmationCard key={idx} payload={parsed.data} />;
  }
  if (part.type === 'data-citation-warning') {
    const parsed = CitationWarningPartSchema.safeParse(part);
    if (!parsed.success) {
      return <FallbackPartView key={idx} part={malformedFallback('citation warning')} />;
    }
    return <CitationWarningPartView key={idx} part={parsed.data} />;
  }
  if (part.type === 'data-verify-warning') {
    const parsed = VerifyWarningPartSchema.safeParse(part);
    if (!parsed.success) {
      return <FallbackPartView key={idx} part={malformedFallback('verify warning')} />;
    }
    // For now reuse the citation warning's tone-styled card with a custom
    // header; a bespoke verify-warning component can graduate later.
    return <CitationWarningPartView key={idx} part={citationWarningFromVerify(parsed.data)} />;
  }
  if (part.type === 'data-plan') {
    // Defensive fallback — the planner persists plans on a sibling
    // system message and this branch is unreachable in practice.
    const parsed = UserPlanPartSchema.safeParse(part);
    if (!parsed.success) {
      return <FallbackPartView key={idx} part={malformedFallback('plan')} />;
    }
    return <PlanPart key={idx} plan={parsed.data} />;
  }

  // Phase B — UX_UPGRADE_PLAN.md item 15. Inline card explaining
  // that the requested model override failed and the default was
  // used instead. The amber tone is distinct from citation
  // warnings (bear) so the user can tell them apart at a glance.
  if (part.type === 'data-fallback') {
    const parsed = FallbackPartSchema.safeParse(part);
    if (!parsed.success) {
      return null;
    }
    return <FallbackPartView key={idx} part={parsed.data} />;
  }

  // Audit plan §1.5 — native memory prep failed and the turn fell back to
  // explicit history; the user should know semantic recall was off.
  if (part.type === 'data-memory-degraded') {
    const parsed = MemoryDegradedPartSchema.safeParse(part);
    if (!parsed.success) {
      return null;
    }
    return <MemoryDegradedPartView key={idx} part={parsed.data} />;
  }

  return null;
}

const MemoizedTextPart = memo(function MemoizedTextPart({
  text,
  role,
  isStreaming,
}: {
  text: string;
  role: 'user' | 'assistant';
  isStreaming: boolean;
}) {
  return <TextPart text={text} role={role} isStreaming={isStreaming} />;
});

const MemoizedToolPart = memo(function MemoizedToolPart({
  name,
  output,
  state,
  errorMessage,
}: {
  name: string;
  output: unknown;
  state: ToolPartState;
  errorMessage?: string;
}) {
  return <ChatToolPart name={name} output={output} state={state} errorMessage={errorMessage} />;
});
