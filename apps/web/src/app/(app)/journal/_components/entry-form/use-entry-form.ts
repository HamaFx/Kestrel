// SPDX-License-Identifier: Apache-2.0

// Journal entry form state, field validation, screenshot upload, and submit.
import { type Symbol, type TradeSide } from '@kestrel/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiFetch } from '@/lib/http/api-client';

import { createJournalEntryAction } from '../../actions';
import { useTagSuggestions } from './tag-suggestions';

const entrySchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['long', 'short']),
  entry: z
    .number({
      error: (issue) => (issue.input === undefined ? undefined : 'Entry price must be a number'),
    })
    .positive('Entry price must be positive'),
  stop: z.number().positive('Stop loss must be positive').nullable().optional(),
  target: z.number().positive('Target must be positive').nullable().optional(),
  size: z.number().positive('Size must be positive').nullable().optional(),
  notes: z.string().max(5000, 'Notes must be under 5000 characters').nullable().optional(),
  tags: z.array(z.string()).optional(),
});

interface UseEntryFormArgs {
  onCreated?: () => void;
}

export function useEntryForm({ onCreated }: UseEntryFormArgs) {
  const [symbol, setSymbol] = useState<Symbol>('XAUUSD');
  const [side, setSide] = useState<TradeSide>('long');
  const [entry, setEntry] = useState<string>('');
  const [stop, setStop] = useState<string>('');
  const [target, setTarget] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tagSuggestions = useTagSuggestions();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({
    entry: null,
    stop: null,
    target: null,
  });

  function validateEntry(v: string): string | null {
    const n = Number(v);
    if (!v) return 'Entry price is required';
    if (!Number.isFinite(n) || n <= 0) return 'Entry must be positive';
    return null;
  }

  function validateStop(v: string): string | null {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 'Stop must be positive';
    const entryNum = Number(entry);
    if (Number.isFinite(entryNum)) {
      if (side === 'long' && n >= entryNum) return 'Long stop must be below entry';
      if (side === 'short' && n <= entryNum) return 'Short stop must be above entry';
    }
    return null;
  }

  function validateTarget(v: string): string | null {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 'Target must be positive';
    const entryNum = Number(entry);
    if (Number.isFinite(entryNum)) {
      if (side === 'long' && n <= entryNum) return 'Long target must be above entry';
      if (side === 'short' && n >= entryNum) return 'Short target must be below entry';
    }
    return null;
  }

  function setFieldError(field: string, err: string | null) {
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
  }

  function handleSideChange(v: TradeSide) {
    setSide(v);
    setFieldError('stop', stop ? validateStop(stop) : null);
    setFieldError('target', target ? validateTarget(target) : null);
  }

  function handleEntryChange(value: string) {
    setEntry(value);
    setFieldError('entry', null);
  }

  function handleEntryBlur() {
    setFieldError('entry', validateEntry(entry));
  }

  function handleStopChange(value: string) {
    setStop(value);
    setFieldError('stop', null);
  }

  function handleStopBlur() {
    setFieldError('stop', validateStop(stop));
  }

  function handleTargetChange(value: string) {
    setTarget(value);
    setFieldError('target', null);
  }

  function handleTargetBlur() {
    setFieldError('target', validateTarget(target));
  }

  function handleSizeChange(value: string) {
    setSize(value);
  }

  function toggleTag(tag: string) {
    if (tags.includes(tag)) {
      setTags(tags.filter((t) => t !== tag));
    } else {
      setTags([...tags, tag]);
    }
  }

  async function handleScreenshotPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiFetch<{ url?: string }>('/api/upload', { method: 'POST', body: fd });
      if (data.url) setScreenshotUrl(data.url);
    } catch {
      toast.error('Screenshot upload failed');
    } finally {
      setUploadingScreenshot(false);
    }
  }

  function removeScreenshot() {
    setScreenshotUrl(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const parsed = {
      symbol,
      side,
      entry: entry ? Number(entry) : NaN,
      stop: stop ? Number(stop) : null,
      target: target ? Number(target) : null,
      size: size ? Number(size) : null,
      notes: notes.trim() || null,
      tags,
      screenshotUrl,
    };

    const validation = entrySchema.safeParse(parsed);
    if (!validation.success) {
      setBusy(false);
      setError(validation.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    const data = validation.data;

    // Field-level sanity check: long stops must be below entry, short above.
    if (data.stop !== null && data.stop !== undefined) {
      if (side === 'long' && data.stop >= data.entry) {
        setBusy(false);
        setError('Long stop must be below entry');
        return;
      }
      if (side === 'short' && data.stop <= data.entry) {
        setBusy(false);
        setError('Short stop must be above entry');
        return;
      }
    }

    try {
      const res = await createJournalEntryAction({
        symbol: data.symbol,
        side: data.side,
        openedAt: Date.now(),
        entry: data.entry,
        stop: data.stop,
        target: data.target,
        size: data.size,
        notes: data.notes,
        tags: data.tags,
        screenshotUrl: screenshotUrl ?? undefined,
      });
      if (!res.ok) {
        throw new Error(res.error ?? 'Create failed');
      }
      setEntry('');
      setStop('');
      setTarget('');
      setSize('');
      setNotes('');
      setTags([]);
      setScreenshotUrl(null);
      toast.success('Trade logged', { description: `${symbol} ${side} @ ${data.entry}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('Save failed', { description: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return {
    symbol,
    setSymbol,
    side,
    handleSideChange,
    entry,
    stop,
    target,
    size,
    notes,
    setNotes,
    tags,
    setTags,
    toggleTag,
    screenshotUrl,
    uploadingScreenshot,
    busy,
    error,
    tagSuggestions,
    fieldErrors,
    handleEntryChange,
    handleEntryBlur,
    handleStopChange,
    handleStopBlur,
    handleTargetChange,
    handleTargetBlur,
    handleSizeChange,
    handleScreenshotPick,
    removeScreenshot,
    submit,
  };
}
