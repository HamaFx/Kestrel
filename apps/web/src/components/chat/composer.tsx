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

// Premium chat composer.
//
// New in this iteration:
//   - When `isStreaming` is true the IconArrowRight button morphs into a Stop button
//     (square indicator + amber ring) wired to the AI SDK's `stop()`.
//   - When voice input is active the mic gets a soft "mic-pulse" ring
//     and a "Listening…" caption appears above the row so the user gets
//     unambiguous state feedback.
//   - Keyboard hint "Enter to send · Shift+Enter for new line" surfaces
//     on focus (desktop only — hidden on touch).
//   - Image thumbnail rail is keyboard-focusable for delete.
import {
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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { useSlashCommands } from '@/hooks/use-slash-commands';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

import type { AnalysisMode } from './chat-top-bar';
import { formatCharCount, getCharCountTone, MAX_TEXT_CHARS } from './composer-helpers';
import { ComposerSlashMenu, type SlashMenuCommand } from './composer-slash-menu';

export interface ComposerImage {
  id: string;
  /**
   * Public URL returned by `/api/upload`. The chat-screen ships this
   * to the model in the message's `files` array; pre-Phase-3 this
   * was a `data:` URL embedded inline.
   */
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
}

const DEFAULT_LANG = 'en-US';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Slash commands for CLI-style chat composer.
interface SlashCommand {
  command: string;
  description: string;
  icon: ReactNode;
  /** Placeholder text inserted when the command is selected. */
  placeholder: string;
  /** If true, selecting this command navigates rather than typing. */
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
    description: 'Run full desk analysis on a symbol',
    icon: <IconTerminal2 className="size-4" />,
    placeholder: '/analyze XAUUSD',
  },
];
// MAX_TEXT_CHARS and SOFT_LIMIT_CHARS are imported from ./composer-helpers
// so the thresholds can be unit-tested and shared with the route layer if
// the cap ever needs server-side enforcement.

const SEND_PIXEL_COORDINATES: readonly [number, number][] = [
  [7, 4],
  [12.5, 10],
  [1.19, 10],
  [4, 7],
  [10, 7],
];

export function Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask about price action, key levels, or market news…',
  analysisMode,
  onAnalysisModeChange,
  chatModel,
  onChatModelChange: _onChatModelChange,
  contextUsagePercent = 6,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect touch once on mount so we can hide desktop-only affordances.
  // Using pointer: coarse correctly targets mobile devices and ignores touch-enabled laptops.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Auto-focus on desktop after mount and after streaming completes.
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

  // M3: Slash commands via dedicated hook.
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

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    if (trimmed.length > MAX_TEXT_CHARS) {
      setError(`Message too long (max ${MAX_TEXT_CHARS} chars)`);
      return;
    }
    // If a slash-command action is selected, trigger it.
    if (slashActive && slashIndex >= 0 && slashIndex < filteredCommands.length) {
      const cmd = filteredCommands[slashIndex];
      if (cmd) {
        selectSlashCommand(cmd);
        return;
      }
    }
    setPulsing(true);
    setTimeout(() => setPulsing(false), 1400);
    onSubmit(trimmed, images);
    setValue('');
    setImages([]);
    setError(null);
    setSlashIndex(-1);
    if (!isTouch) {
      requestAnimationFrame(() => ref.current?.focus());
    }
  }

  // Phase 3 hardening §7 — images are pre-uploaded to Supabase
  // Storage via `/api/upload` and only the public URL ships in the
  // chat message. The pre-fix code base64-embedded each image
  // inline, which capped at one small image per Vercel's 4.5 MB body
  // limit.
  async function pickImages(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per message`);
      return;
    }

    const chosenFiles = Array.from(files).slice(0, remaining);

    // Create upload promises
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

    // Phase 1 hardening §12 — clamp pasted text to MAX_TEXT_CHARS so the
    // counter can't pretend the user is "over the cap" while the textarea
    // still accepts more. The textarea's own `maxLength` is now strict,
    // but Safari + some IMEs ignore `maxLength` on paste, so we enforce
    // it here too.
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

  // Char-count tone — pure helper from composer-helpers so the
  // thresholds are unit-tested in test/composer-helpers.test.ts.
  const charCountTone = getCharCountTone(charCount);
  const charCountClass =
    charCountTone === 'danger'
      ? 'text-danger font-semibold'
      : charCountTone === 'warn'
        ? 'text-warn font-medium'
        : 'text-fg-subtle';

  return (
    <div className="message-composer-safe-bottom sticky bottom-0 z-20 mx-auto w-full max-w-4xl xl:max-w-5xl px-3 pb-[max(env(safe-area-inset-bottom),12px)] transition-all duration-300">
      <form
        className={cn(
          'border-chip-edge bg-surface-panel bg-bg-elev-1 surface-chip-dark relative z-10 flex w-full flex-col gap-1.5 rounded-[16px] border-[0.5px] p-2 shadow-(--shadow-chat-bar) transition-all duration-150',
          focused && 'border-brand/50 ring-1 ring-brand/30',
          dragOver && 'border-brand ring-2 ring-brand/40',
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
        {pulsing && (
          <span
            aria-hidden="true"
            className="prompt-pulse pointer-events-none absolute inset-0 rounded-[16px]"
          />
        )}

        {/* Voice listening pill */}
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

        {/* Attached Images */}
        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-2 px-3 pt-2 pb-1" aria-label="Attached images">
            {images.map((img, idx) => (
              <li key={img.id} className="relative">
                <Image
                  src={img.url}
                  alt={`Attached image ${idx + 1} of ${images.length}`}
                  width={56}
                  height={56}
                  unoptimized
                  className="border-border size-14 rounded-lg border object-cover shadow-sm"
                />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => removeImage(img.id)}
                  className="bg-bg-elev-3 text-fg border-border focus-visible:ring-fg absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border text-xs leading-none focus:outline-none focus-visible:ring-2 shadow"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p id="composer-error" role="alert" className="text-danger px-3 pt-1 text-xs">
            {error}
          </p>
        ) : null}

        <ComposerSlashMenu
          active={slashActive && filteredCommands.length > 0}
          commands={filteredCommands as readonly SlashMenuCommand[]}
          allCommands={SLASH_COMMANDS}
          activeIndex={slashIndex}
          onSelect={selectSlashCommand}
          onHover={setSlashIndex}
        />

        {/* Main Textarea Container */}
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-1">
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
              'text-fg placeholder:text-fg-subtle w-full resize-none border-0 bg-transparent p-0 text-body leading-[1.45] shadow-none focus:outline-none focus-visible:ring-0',
              'max-h-[4lh] min-h-[38px] sm:max-h-[10lh] [field-sizing:content]',
            )}
            onKeyDown={(e) => {
              if (handleSlashKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            onChange={(e) => {
              handleSlashChange(e.target.value);
            }}
          />
        </div>

        {/* Bottom Instrument Tool Bar */}
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
          {/* Left tool chips */}
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
            {/* Attach File/Image button */}
            <button
              type="button"
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || images.length >= MAX_IMAGES}
              className={cn(
                'text-fg-subtle hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg transition-colors tactile-press',
                'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2 active:translate-y-[0.5px]',
                disabled || images.length >= MAX_IMAGES
                  ? 'cursor-not-allowed opacity-50'
                  : '',
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
                  'text-fg-subtle hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg transition-colors tactile-press',
                  'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2 active:translate-y-[0.5px]',
                  voice.active
                    ? 'text-danger mic-pulse bg-danger/10'
                    : '',
                  disabled ? 'cursor-not-allowed opacity-50' : '',
                )}
              >
                <IconMicrophone className="size-4" strokeWidth={1.75} />
              </button>
            ) : null}

            {/* Mode / Analysis Chip */}
            {analysisMode && onAnalysisModeChange ? (
              <button
                type="button"
                onClick={() => {
                  const modes: AnalysisMode[] = ['auto', 'single', 'quick', 'standard', 'full'];
                  const idx = modes.indexOf(analysisMode);
                  const next = modes[(idx + 1) % modes.length];
                  if (next) onAnalysisModeChange(next);
                }}
                aria-label={`Analysis mode: ${analysisMode}`}
                className="border-chip-edge bg-background/50 hover:bg-bg-elev-2 active:bg-bg-elev-3 font-mono text-caption text-fg-muted hover:text-fg flex h-10 sm:h-9 min-h-10 items-center gap-1.5 rounded-md border px-2.5 font-normal transition-colors tactile-press active:translate-y-[0.5px]"
              >
                <span className="size-1.5 rounded-full bg-brand" />
                <span className="capitalize">{analysisMode}</span>
                <span className="text-[10px] text-fg-subtle">▾</span>
              </button>
            ) : null}

            {/* Model Chip (if provided) */}
            {chatModel && (
              <span className="border-chip-edge bg-background/50 font-mono text-caption text-fg-subtle hidden sm:inline-flex h-10 sm:h-9 items-center gap-1 rounded-md border px-2">
                <span className="truncate max-w-[120px]">{chatModel.split(':').pop()}</span>
              </span>
            )}
          </div>

          {/* Right actions: Context usage meter + Char Count + Send/Stop Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Context usage meter */}
            <div
              title="Context Window Usage"
              className="flex items-center gap-1 font-mono text-[11px] text-fg-subtle tabular-nums select-none"
            >
              <span className="size-3 rounded-full border border-fg-subtle/40 border-t-brand" />
              <span>{contextUsagePercent}%</span>
            </div>

            {/* Char count */}
            <span
              aria-live="polite"
              aria-label={`${charCount} of ${MAX_TEXT_CHARS} characters used`}
              className={cn('text-[11px] font-mono tabular-nums', charCountClass)}
            >
              {formatCharCount(charCount)}
            </span>

            {focused && !isTouch && !isStreaming ? (
              <p className="text-fg-subtle text-[11px] font-mono hidden pr-1 tabular-nums lg:block">
                <kbd className="bg-bg-elev-2 border-border/80 rounded border px-1 text-[10px]">
                  ↵
                </kbd>
              </p>
            ) : null}

            <AnimatePresence mode="popLayout" initial={false}>
              {isStreaming && onStop ? (
                <m.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="chip-press text-danger border-danger/40 bg-danger/15 inline-flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border tactile-press active:translate-y-[0.5px]"
                >
                  <IconSquare className="size-3.5 fill-current" strokeWidth={0} />
                </m.button>
              ) : (
                <m.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className={cn(
                    'chip-press group bg-fg hover:bg-white text-black inline-flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg font-medium transition-colors tactile-press',
                    'disabled:cursor-not-allowed disabled:opacity-35 disabled:grayscale active:translate-y-[0.5px]',
                  )}
                >
                  <span className="relative block size-[16px]">
                    {SEND_PIXEL_COORDINATES.map(([left, top], idx) => (
                      <span
                        key={idx}
                        style={{ left: `${left}px`, top: `${top}px` }}
                        className="bg-black absolute size-[2.5px] rounded-[0.6px]"
                      />
                    ))}
                  </span>
                </m.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </div>
  );
}
