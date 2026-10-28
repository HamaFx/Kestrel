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

// One chat message. Part rendering and action controls live in dedicated
// components; this shell owns the edit mode and message frame.
import { UserPlanPartSchema } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { m, useReducedMotion } from 'motion/react';
import { memo, useMemo, useState } from 'react';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { Button } from '@/components/ui/button';
import { useCopied } from '@/hooks/use-copied';
import { cn } from '@/lib/formatters/cn';

import { FollowUpSuggestions } from './_components/follow-up-suggestions';
import { MessageFeedback } from './_components/message-feedback';
import { MessageFooter } from './_components/message-footer';
import { MAX_TEXT_CHARS } from './composer-helpers';
import { MessageActionsBar } from './message-actions-bar';
import { extractText } from './message-parts';
import { renderMessageParts } from './message-parts-renderer';
import { PlanPart } from './parts/plan';

interface MessageProps {
  message: UIMessage;
  threadId: string;
  onCopy?: (text: string) => void;
  onRegenerate?: (opts?: { modelOverride?: string }) => void;
  onEdit?: (messageId: string, newText: string) => void;
  isStreaming?: boolean;
  isLastAssistant?: boolean;
  onFollowUpSelect?: (prompt: string) => void;
}

function MessageImpl({
  threadId,
  message,
  onCopy,
  onRegenerate,
  onEdit,
  isStreaming,
  isLastAssistant,
  onFollowUpSelect,
}: MessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const prefersReducedMotion = useReducedMotion();
  const plainText = useMemo(() => extractText(message), [message]);
  const rawTime = (message as { createdAt?: Date | string | number }).createdAt;
  const formattedTime = rawTime
    ? new Date(rawTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;
  const [copied, triggerCopy] = useCopied(1200);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(plainText);

  if (isSystem) {
    const rawPlan = (message.parts ?? []).find(
      (p) => p !== null && typeof p === 'object' && (p as { type?: string }).type === 'data-plan',
    );
    const planParse = rawPlan ? UserPlanPartSchema.safeParse(rawPlan) : null;
    if (planParse?.success) {
      return (
        <div className="flex w-full justify-start">
          <div className="w-full max-w-[88%]">
            <PlanPart plan={planParse.data} streaming={isStreaming} />
          </div>
        </div>
      );
    }
    return null;
  }

  const hasActions = (!isUser && (plainText.length > 0 || onRegenerate)) || (isUser && onEdit);

  function copy() {
    if (!plainText) return;
    void navigator.clipboard.writeText(plainText);
    onCopy?.(plainText);
    triggerCopy();
  }

  if (isUser && isEditing) {
    return (
      <div className="mt-1 mb-2 flex w-full justify-end">
        <div className="surface-well border-border focus-within:border-brand/60 focus-within:ring-brand/20 flex w-full max-w-[88%] flex-col gap-2.5 rounded-xl border p-3.5 focus-within:ring-2">
          <textarea
            className="text-fg [field-sizing:content] w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            maxLength={MAX_TEXT_CHARS}
            autoFocus
            aria-label="Edit message"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setIsEditing(false);
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsEditing(false);
                onEdit?.(message.id, editValue);
              }
            }}
          />
          <div className="border-border/50 mt-1 flex items-center justify-end gap-2 border-t pt-2.5">
            <Button type="button" variant="secondary" size="xs" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => {
                setIsEditing(false);
                onEdit?.(message.id, editValue);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <m.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }
      }
      data-message-role={message.role}
      className={cn('group flex w-full flex-col gap-2', isUser ? 'items-end' : 'items-start')}
    >
      <div className={cn('flex w-full', !isUser && !isSystem ? 'items-start gap-3' : '')}>
        {!isUser && !isSystem ? (
          <span
            aria-hidden="true"
            className="mt-1 inline-flex size-5 shrink-0 items-center justify-center"
          >
            <KestrelBrand
              variant="mark"
              markSize="xs"
              decorative
              className={cn(isStreaming ? 'opacity-100' : 'opacity-85')}
            />
          </span>
        ) : null}
        <div
          className={cn('flex flex-col gap-2', !isUser && !isSystem ? 'min-w-0 flex-1' : 'w-full')}
        >
          <div
            className={cn(
              'relative flex flex-col gap-2',
              isUser
                ? 'group/bubble surface-chip bg-bg-elev-2/90 text-fg ml-auto max-w-[82%] rounded-xl border border-white/10 px-3.5 py-2.5 font-medium backdrop-blur-[2px]'
                : 'w-full',
              !isUser && !isSystem ? 'py-1' : 'py-3',
            )}
          >
            {isUser && formattedTime ? (
              <span className="text-fg-subtle pointer-events-none absolute bottom-2 -left-14 font-mono text-[11px] opacity-0 transition-opacity duration-150 select-none group-hover/bubble:opacity-100">
                {formattedTime}
              </span>
            ) : null}
            <div>{renderMessageParts(message.parts, isStreaming, message.role)}</div>
          </div>

          {!isUser && !isStreaming ? (
            <div className="w-full">
              <MessageFooter message={message} />
            </div>
          ) : null}

          {!isUser && !isStreaming ? (
            <MessageFeedback threadId={threadId} messageId={message.id} />
          ) : null}

          {hasActions ? (
            <MessageActionsBar
              message={message}
              plainText={plainText}
              isUser={isUser}
              copied={copied}
              onCopy={copy}
              onRegenerate={onRegenerate}
              onEditStart={
                onEdit
                  ? () => {
                      setEditValue(plainText);
                      setIsEditing(true);
                    }
                  : undefined
              }
            />
          ) : null}

          {!isUser && isLastAssistant && !isStreaming && onFollowUpSelect && (
            <FollowUpSuggestions
              message={message}
              onSelect={onFollowUpSelect}
              disabled={isStreaming}
            />
          )}
        </div>
      </div>
    </m.div>
  );
}

export const Message = memo(MessageImpl, (prev, next) => {
  if (
    prev.threadId !== next.threadId ||
    prev.message.id !== next.message.id ||
    prev.onRegenerate !== next.onRegenerate ||
    prev.onEdit !== next.onEdit ||
    prev.onCopy !== next.onCopy ||
    prev.isStreaming !== next.isStreaming ||
    prev.isLastAssistant !== next.isLastAssistant ||
    prev.onFollowUpSelect !== next.onFollowUpSelect
  ) {
    return false;
  }
  if (prev.message.parts !== next.message.parts) {
    if (!prev.message.parts || !next.message.parts) return false;
    if (prev.message.parts.length !== next.message.parts.length) return false;
    for (let i = 0; i < prev.message.parts.length; i++) {
      if (prev.message.parts[i] !== next.message.parts[i]) return false;
    }
  }
  return true;
});
