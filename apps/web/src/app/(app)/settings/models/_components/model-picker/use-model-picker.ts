// SPDX-License-Identifier: Apache-2.0

// Model-picker state: hydrates the saved value from the per-domain GET
// endpoint, saves picks, clears overrides, and derives the option list.

import type { ProviderMeta } from '@kestrel/shared';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { apiFetch, apiMutate } from '@/lib/http/api-client';

import { buildModelOptions, ENDPOINTS, RESPONSE_KEYS, type ModelPickerKind } from './model-options';
import { TITLES } from './model-picker-copy';

type SaveState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'error'; message: string };

export function useModelPicker({
  kind,
  initialValue = null,
  providers,
}: {
  kind: ModelPickerKind;
  initialValue?: string | null;
  providers: ProviderMeta[];
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  const [hydrated, setHydrated] = useState(initialValue !== null);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  const endpoint = ENDPOINTS[kind];
  const responseKey = RESPONSE_KEYS[kind];

  // If we weren't given the saved value at render time, fetch it
  // on mount via the per-domain GET endpoint.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<Record<string, string | null>>(endpoint, { cache: 'no-store' });
        if (!cancelled) setValue(data[responseKey] ?? null);
      } catch {
        // ignore fetch failures — the picker just stays un-hydrated
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, responseKey, hydrated]);

  function pick(next: string) {
    if (next === value) return;
    setSave({ kind: 'pending' });
    startTransition(async () => {
      try {
        const sep = next.indexOf(':');
        const providerId = next.slice(0, sep);
        const modelId = next.slice(sep + 1);

        const data = await apiMutate<Record<string, string>>(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, modelId }),
        });
        setValue(data[responseKey] ?? null);
        setSave({ kind: 'idle' });
        toast.success(`${TITLES[kind]} updated`);
      } catch (err) {
        setSave({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
        toast.error(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  async function clearOverride() {
    setSave({ kind: 'pending' });
    try {
      await apiMutate(endpoint, { method: 'DELETE' });
      setValue(null);
      setSave({ kind: 'idle' });
      toast.success('Cleared override — using fallback');
    } catch (err) {
      setSave({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    }
  }

  const options = buildModelOptions(providers, kind);
  const current = options.find((o) => o.value === value);
  const currentLabel = current
    ? `${current.providerLabel} · ${current.label}`
    : 'Use fallback (operator env / spec default)';

  return { value, hydrated, save, pending, options, currentLabel, pick, clearOverride };
}
