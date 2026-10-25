// SPDX-License-Identifier: Apache-2.0

// AI preferences state: localStorage-backed custom instructions synced with
// the server value, preset apply/append helpers, and debounced server writes.

import { useEffect, useRef } from 'react';

import { updateAiPrefsAction } from '@/app/(app)/settings/actions';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { migrateLocalStorageKey } from '@/lib/http/storage';

import { appendPreset, getPreset } from './instruction-presets';

export interface AIPrefs {
  customInstructions: string;
}

export const AI_PREFS_STORAGE_KEY = 'kestrel:ai-prefs:v1';

const DEFAULTS: AIPrefs = {
  customInstructions: '',
};

export function useAiPrefs(initialCustomInstructions?: string | null) {
  const [prefs, setPrefs, hydrated] = useLocalStorage<AIPrefs>(AI_PREFS_STORAGE_KEY, DEFAULTS);
  const [confirmEl, confirm] = useConfirm();
  // STAB-16: Move the debounce timer into a useRef so it's cleaned
  // up on unmount. Previously a module-level `let` variable would
  // fire callbacks on stale component state after navigation.
  const aiSyncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Migrate from the legacy unversioned key once, and clean the debounce
  // timer up on unmount (both were previously separate effects).
  useEffect(() => {
    migrateLocalStorageKey('hamafx:ai-prefs', AI_PREFS_STORAGE_KEY);
    return () => {
      if (aiSyncTimerRef.current) clearTimeout(aiSyncTimerRef.current);
    };
  }, []);

  // Always sync server value to localStorage (DB is source of truth).
  // Resolves drift from cross-device DB changes or cleared localStorage.
  const serverInstructions = initialCustomInstructions ?? '';
  useEffect(() => {
    if (hydrated && serverInstructions !== (prefs?.customInstructions ?? '')) {
      setPrefs((prev) => ({ ...prev, customInstructions: serverInstructions }));
    }
    // prefs and setPrefs deliberately excluded to avoid infinite sync loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, serverInstructions]);

  const customInstructions = hydrated
    ? (prefs?.customInstructions ?? '')
    : (initialCustomInstructions ?? '');

  function update<K extends keyof AIPrefs>(key: K, value: AIPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  function handleInstructionsChange(value: string) {
    update('customInstructions', value);
    if (aiSyncTimerRef.current) clearTimeout(aiSyncTimerRef.current);
    aiSyncTimerRef.current = setTimeout(() => {
      updateAiPrefsAction(value);
    }, 500);
  }

  /**
   * Apply a preset. `mode === 'replace'` overwrites the textarea
   * (with a confirm prompt if the field is non-empty). `mode ===`
   * 'append'` joins the preset text to the existing value.
   */
  async function applyPreset(presetId: string, mode: 'replace' | 'append') {
    let newValue: string;
    if (mode === 'append') {
      newValue = appendPreset(customInstructions, presetId);
    } else {
      if (customInstructions.trim().length > 0) {
        const ok = await confirm({
          title: 'Replace custom instructions?',
          description: 'Replace your existing custom instructions with this preset?',
          confirmLabel: 'Replace',
          tone: 'danger',
        });
        if (!ok) return;
      }
      const preset = getPreset(presetId);
      newValue = preset ? preset.prompt : customInstructions;
    }
    update('customInstructions', newValue);
    await updateAiPrefsAction(newValue);
  }

  return {
    customInstructions,
    hydrated,
    confirmEl,
    update,
    handleInstructionsChange,
    applyPreset,
  };
}
