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
  IconArrowUp,
  IconChartBar,
  IconMicrophone,
  IconNotebook,
  IconPaperclip,
  IconSettings,
  IconSquare,
  IconTerminal2,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import Image from 'next/image';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { useSlashCommands } from '@/hooks/use-slash-commands';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

import { ChatModelSelector } from './_components/chat-model-selector';
import { CustomAgentSelector } from './_components/custom-agent-selector';
import { MODE_DESCRIPTIONS, MODE_LABELS, type AnalysisMode } from './chat-top-bar';
import { formatCharCount, getCharCountTone, MAX_TEXT_CHARS } from './composer-helpers';
import { ComposerSlashMenu, type SlashMenuCommand } from './composer-slash-menu';

export interface ComposerImage {
  id: string;
  url: string;
  mediaType: string;
  name: string;
}

interface ComposerProps {
  onSubmit: (text: string, images: ComposerImage[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  analysisMode?: AnalysisMode;
  onAnalysisModeChange?: (mode: AnalysisMode) => void;
  chatModel?: string | null;
  onChatModelChange?: (modelId: string) => void;
  contextUsagePercent?: number;
  customAgents?: readonly CustomAgentSummary[];
  selectedAgentSlug?: string | null;
  onAgentChange?: (slug: string | null) => void;
}

const DEFAULT_LANG = 'en-US';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface SlashCommand {
  command: string;
  description: string;
  icon: ReactNode;
  placeholder: string;
  action?: 'navigate';
  href?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/chart',
    description: 'Open chart for a symbol',
    icon: <IconChartBar className="size-4" />,
    placeholder: '/chart XAUUSD',
  },
  {
    command: '/journal',
    description: 'Log a trade setup (direction, symbol, R)',
    icon: <IconNotebook className="size-4" />,
    placeholder: '/journal buy XAUUSD 2R',
  },
  {
    command: '/settings',
    description: 'Open settings page',
    icon: <IconSettings className="size-4" />,
    placeholder: '/settings',
    action: 'navigate',
    href: '/settings',
  },
  {
    command: '/analyze',
    description: 'Run full 4-desk analysis on a symbol',
    icon: <IconTerminal2 className="size-4" />,
    placeholder: '/analyze XAUUSD',
  },
];

export const Composer = memo(function Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask about price action, key levels, or market news…',
  analysisMode,
  onAnalysisModeChange,
  chatModel,
  onChatModelChange,
  contextUsagePercent,
  customAgents = [],
  selectedAgentSlug = null,
  onAgentChange,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (ref.current && !disabled && !isTouch) {
      ref.current.focus();
    }
  }, [disabled, isTouch]);

  const [lang, setLang] = useState(DEFAULT_LANG);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.language) {
      setLang(navigator.language);
    }
  }, []);
  const voice = useVoiceInput({
    lang,
    onText: (transcript) => {
      setValue(transcript);
    },
    onError: (msg) => {
      toast.error(msg);
    },
  });

  const {
    slashActive,
    filteredCommands,
    slashIndex,
    setSlashIndex,
    selectSlashCommand,
    handleSlashKeyDown,
    handleSlashChange,
  } = useSlashCommands({
    value,
    setValue,
    textareaRef: ref,
    commands: SLASH_COMMANDS.map((c) => ({
      command: c.command,
      description: c.description,
      placeholder: c.placeholder,
      action: c.action,
      href: c.href,
    })) as readonly {
      command: string;
      description: string;
      placeholder: string;
      action?: 'navigate';
      href?: string;
    }[],
  });

  // `@handle` autocomplete. Only active while the whole input is a handle
  // prefix, so an @mention inside normal prose never hijacks Enter.
  const mentionMatch = /^@([a-z0-9-]*)$/i.exec(value);
  const mentionAgents =
    mentionMatch && customAgents.length > 0
      ? customAgents
          .filter((agent) => agent.slug.startsWith((mentionMatch[1] ?? '').toLowerCase()))
          .slice(0, 6)
      : [];
  const activeMentionIndex = Math.min(mentionIndex, Math.max(0, mentionAgents.length - 1));

  function insertMention(slug: string) {
    setValue(`@${slug} `);
    setMentionIndex(0);
    requestAnimationFrame(() => ref.current?.focus());
  }

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    if (trimmed.length > MAX_TEXT_CHARS) {
      setError(`Message too long (max ${MAX_TEXT_CHARS} chars)`);
      return;
    }
    if (slashActive && slashIndex >= 0 && slashIndex < filteredCommands.length) {
      const cmd = filteredCommands[slashIndex];
      if (cmd) {
        selectSlashCommand(cmd);
        return;
      }
    }
    onSubmit(trimmed, images);
    setValue('');
    setImages([]);
    setError(null);
    setSlashIndex(-1);
    if (!isTouch) {
      requestAnimationFrame(() => ref.current?.focus());
    }
  }

  async function pickImages(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per message`);
      return;
    }

    const chosenFiles = Array.from(files).slice(0, remaining);

    const uploadPromises = chosenFiles.map(async (file) => {
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are accepted');
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`"${file.name}" exceeds 5 MB`);
      }

      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetchCsrf('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upload failed for "${file.name}": ${res.status} ${text.slice(0, 80)}`);
      }
      const json = (await res.json()) as { url?: string; mediaType?: string };
      const url = typeof json.url === 'string' ? json.url : null;
      if (!url) {
        throw new Error(`Upload returned no URL for "${file.name}"`);
      }

      return {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        url,
        mediaType: json.mediaType ?? file.type,
        name: file.name,
      };
    });

    const results = await Promise.allSettled(uploadPromises);

    const succeeded: ComposerImage[] = [];
    const uploadErrors: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else {
        uploadErrors.push(
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );
      }
    }

    if (succeeded.length > 0) {
      setImages((prev) => [...prev, ...succeeded]);
    }
    if (uploadErrors.length > 0) {
      setError(uploadErrors.join(', '));
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((p) => p.id !== id));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      void pickImages(dt.files);
      return;
    }

    const pasted = e.clipboardData?.getData('text');
    if (pasted) {
      const target = e.currentTarget;
      const start = target.selectionStart ?? value.length;
      const end = target.selectionEnd ?? value.length;
      const next = `${value.slice(0, start)}${pasted}${value.slice(end)}`;
      if (next.length > MAX_TEXT_CHARS) {
        e.preventDefault();
        setValue(next.slice(0, MAX_TEXT_CHARS));
        setError(`Message clipped to ${MAX_TEXT_CHARS} chars`);

        const cursorPosition = Math.min(start + pasted.length, MAX_TEXT_CHARS);
        requestAnimationFrame(() => {
          if (ref.current) {
            ref.current.setSelectionRange(cursorPosition, cursorPosition);
          }
        });
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragOver(false);
    void pickImages(e.dataTransfer.files);
  }

  const charCount = value.length;
  const overLimit = charCount > MAX_TEXT_CHARS;
  const canSend = !disabled && !isStreaming && value.trim().length > 0 && !overLimit;
  const activeCommandId =
    slashActive && filteredCommands[slashIndex]
      ? `slash-cmd-${filteredCommands[slashIndex].command}`
      : undefined;

  const charCountTone = getCharCountTone(charCount);
  const charCountClass =
    charCountTone === 'danger'
      ? 'text-danger font-semibold'
      : charCountTone === 'warn'
        ? 'text-warn font-medium'
        : 'text-fg-subtle';

  return (
    <div className="message-composer-safe-bottom sticky bottom-0 z-20 mx-auto w-full pb-[max(env(safe-area-inset-bottom),12px)]">
      <form
        className={cn(
          'border-border bg-bg-elev-1 relative z-10 flex w-full flex-col gap-1.5 rounded-xl border p-2.5 shadow-md transition-colors duration-150',
          focused && 'border-fg-subtle/60',
          dragOver && 'border-brand ring-brand/40 ring-2',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {voice.active ? (
          <div
            role="status"
            aria-live="polite"
            className="text-danger border-danger/30 bg-danger/10 text-body-sm mx-auto mt-1 inline-flex items-center gap-2 self-center rounded-full border px-3 py-0.5 font-medium"
          >
            <span className="bg-danger size-1.5 rounded-full motion-safe:animate-pulse" />
            Listening…
          </div>
        ) : null}

        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-2 px-2 pt-1 pb-1" aria-label="Attached images">
            {images.map((img, idx) => (
              <li key={img.id} className="relative">
                <Image
                  src={img.url}
                  alt={`Attached image ${idx + 1} of ${images.length}`}
                  width={56}
                  height={56}
                  unoptimized
                  className="border-border size-14 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => removeImage(img.id)}
                  className="bg-bg-elev-3 text-fg border-border focus-visible:ring-fg absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border text-xs leading-none focus:outline-none focus-visible:ring-2"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p id="composer-error" role="alert" className="text-danger px-2 pt-1 text-xs">
            {error}
          </p>
        ) : null}

        {mentionAgents.length > 0 ? (
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
        ) : null}

        <ComposerSlashMenu
          active={slashActive && filteredCommands.length > 0}
          commands={filteredCommands as readonly SlashMenuCommand[]}
          allCommands={SLASH_COMMANDS}
          activeIndex={slashIndex}
          onSelect={selectSlashCommand}
          onHover={setSlashIndex}
        />

        {/* Textarea Input */}
        <div className="flex min-h-0 flex-1 flex-col px-2 pt-0.5">
          <textarea
            ref={ref}
            aria-label="Chat message input"
            aria-describedby={error ? 'composer-error' : undefined}
            aria-expanded={slashActive && filteredCommands.length > 0}
            aria-controls="slash-command-listbox"
            aria-activedescendant={activeCommandId}
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={handlePaste}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={MAX_TEXT_CHARS}
            className={cn(
              'text-fg placeholder:text-fg-subtle text-body w-full resize-none border-0 bg-transparent p-0 leading-[1.45] shadow-none focus:outline-none focus-visible:ring-0',
              '[field-sizing:content] max-h-[4lh] min-h-[36px] sm:max-h-[10lh]',
            )}
            onKeyDown={(e) => {
              if (mentionAgents.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((activeMentionIndex + 1) % mentionAgents.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(
                    (activeMentionIndex - 1 + mentionAgents.length) % mentionAgents.length,
                  );
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  const picked = mentionAgents[activeMentionIndex];
                  if (picked) {
                    e.preventDefault();
                    insertMention(picked.slug);
                    return;
                  }
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setValue('');
                  return;
                }
              }
              if (handleSlashKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            onChange={(e) => {
              setMentionIndex(0);
              handleSlashChange(e.target.value);
            }}
          />
        </div>

        {/* Bottom Control Bar */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 flex-1 [scrollbar-width:none] flex-nowrap items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || images.length >= MAX_IMAGES}
              className={cn(
                'text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2',
                disabled || images.length >= MAX_IMAGES ? 'cursor-not-allowed opacity-50' : '',
              )}
            >
              <IconPaperclip className="size-4" strokeWidth={1.75} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void pickImages(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />

            {voice.supported ? (
              <button
                type="button"
                aria-label={voice.active ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={voice.active}
                onClick={() => (voice.active ? voice.stop() : voice.start())}
                disabled={disabled}
                className={cn(
                  'text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2',
                  voice.active ? 'text-danger bg-danger/10' : '',
                  disabled ? 'cursor-not-allowed opacity-50' : '',
                )}
              >
                <IconMicrophone className="size-4" strokeWidth={1.75} />
              </button>
            ) : null}

            {/* Analysis Mode Toggle (a standalone agent has no committee mode) */}
            {analysisMode && onAnalysisModeChange && !selectedAgentSlug ? (
              <button
                type="button"
                onClick={() => {
                  const modes: AnalysisMode[] = ['single', 'full'];
                  const idx = modes.indexOf(analysisMode);
                  const next = modes[(idx + 1) % modes.length];
                  if (next) onAnalysisModeChange(next);
                }}
                title={MODE_DESCRIPTIONS[analysisMode]}
                aria-label={`Analysis mode: ${MODE_LABELS[analysisMode]}`}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                  analysisMode === 'full'
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-border bg-bg-elev-2 text-fg-muted hover:text-fg',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    analysisMode === 'full' ? 'bg-brand' : 'bg-bull',
                  )}
                />
                <span>{MODE_LABELS[analysisMode]}</span>
              </button>
            ) : null}

            {/* Restored Model Picker */}
            {onChatModelChange ? (
              <ChatModelSelector
                activeModelId={chatModel ?? null}
                disabled={disabled}
                onPick={onChatModelChange}
              />
            ) : null}

            {onAgentChange ? (
              <CustomAgentSelector
                agents={customAgents}
                value={selectedAgentSlug}
                onChange={onAgentChange}
                disabled={disabled}
              />
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {typeof contextUsagePercent === 'number' && (
              <div
                title="Conversation History Used"
                className="text-fg-subtle flex items-center gap-1 font-mono text-xs tabular-nums select-none"
              >
                <span>{contextUsagePercent}%</span>
              </div>
            )}

            <span
              aria-live="polite"
              aria-label={`${charCount} of ${MAX_TEXT_CHARS} characters used`}
              className={cn('font-mono text-xs tabular-nums', charCountClass)}
            >
              {formatCharCount(charCount)}
            </span>

            <AnimatePresence mode="popLayout" initial={false}>
              {isStreaming && onStop ? (
                <m.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="text-danger border-danger/40 bg-danger/15 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border"
                >
                  <IconSquare className="size-3.5 fill-current" strokeWidth={0} />
                </m.button>
              ) : (
                <m.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className={cn(
                    'bg-fg inline-flex size-9 shrink-0 items-center justify-center rounded-lg font-medium text-black transition-colors hover:bg-white',
                    'disabled:cursor-not-allowed disabled:opacity-30',
                  )}
                >
                  <IconArrowUp className="size-4" strokeWidth={2.25} />
                </m.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </div>
  );
});
