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

// Composer state: text, images, slash/mention menus, voice input, and upload.
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { useSlashCommands } from '@/hooks/use-slash-commands';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { fetchCsrf } from '@/lib/auth/csrf';

import { MAX_TEXT_CHARS } from './composer-helpers';

export interface ComposerImage {
  id: string;
  url: string;
  mediaType: string;
  name: string;
}

const DEFAULT_LANG = 'en-US';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SLASH_COMMANDS = [
  { command: '/chart', description: 'Open chart for a symbol', placeholder: '/chart XAUUSD' },
  {
    command: '/journal',
    description: 'Log a trade setup (direction, symbol, R)',
    placeholder: '/journal buy XAUUSD 2R',
  },
  {
    command: '/settings',
    description: 'Open settings page',
    placeholder: '/settings',
    action: 'navigate' as const,
    href: '/settings',
  },
  {
    command: '/analyze',
    description: 'Run full 4-desk analysis on a symbol',
    placeholder: '/analyze XAUUSD',
  },
];

export function useComposer(args: {
  onSubmit: (text: string, images: ComposerImage[]) => void;
  disabled?: boolean | undefined;
  isStreaming?: boolean | undefined;
  customAgents: readonly CustomAgentSummary[];
}) {
  const { onSubmit, disabled, isStreaming, customAgents } = args;
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
    if (ref.current && !disabled && !isTouch) ref.current.focus();
  }, [disabled, isTouch]);

  const [lang, setLang] = useState(DEFAULT_LANG);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.language) setLang(navigator.language);
  }, []);
  const voice = useVoiceInput({
    lang,
    onText: (transcript) => setValue(transcript),
    onError: (msg) => toast.error(msg),
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
    commands: SLASH_COMMANDS,
  });

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
    if (!isTouch) requestAnimationFrame(() => ref.current?.focus());
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
      if (!file.type.startsWith('image/')) throw new Error('Only image files are accepted');
      if (file.size > MAX_IMAGE_BYTES) throw new Error(`"${file.name}" exceeds 5 MB`);

      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetchCsrf('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upload failed for "${file.name}": ${res.status} ${text.slice(0, 80)}`);
      }
      const json = (await res.json()) as { url?: string; mediaType?: string };
      const url = typeof json.url === 'string' ? json.url : null;
      if (!url) throw new Error(`Upload returned no URL for "${file.name}"`);

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
      if (result.status === 'fulfilled') succeeded.push(result.value);
      else
        uploadErrors.push(
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );
    }
    if (succeeded.length > 0) setImages((prev) => [...prev, ...succeeded]);
    if (uploadErrors.length > 0) setError(uploadErrors.join(', '));
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
          ref.current?.setSelectionRange(cursorPosition, cursorPosition);
        });
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragOver(false);
    void pickImages(e.dataTransfer.files);
  }

  return {
    value,
    setValue,
    images,
    error,
    focused,
    setFocused,
    dragOver,
    setDragOver,
    isTouch,
    mentionIndex,
    setMentionIndex,
    ref,
    fileInputRef,
    voice,
    slashActive,
    filteredCommands,
    slashIndex,
    setSlashIndex,
    selectSlashCommand,
    handleSlashKeyDown,
    handleSlashChange,
    mentionAgents,
    activeMentionIndex,
    insertMention,
    send,
    pickImages,
    removeImage,
    handlePaste,
    handleDrop,
    MAX_IMAGES,
    SLASH_COMMANDS,
  };
}

export type ComposerController = ReturnType<typeof useComposer>;
