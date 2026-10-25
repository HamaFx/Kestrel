// SPDX-License-Identifier: Apache-2.0

// Preferences state for the interface & behavior card: localStorage-backed
// prefs, server → client sync, defaultSymbol sanitising, and reduce-motion.

import { DEFAULT_WATCHLIST_SYMBOLS, isKnownSymbol, type Symbol } from '@kestrel/shared';
import { useCallback, useEffect } from 'react';

import { updateUIPrefsAction } from '@/app/(app)/settings/actions';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { migrateLocalStorageKey } from '@/lib/http/storage';

interface Prefs {
  defaultSymbol: Symbol;
  timeFormat: '12h' | '24h';
  reduceMotion: boolean;
}

const STORAGE_KEY = 'kestrel:prefs:v1';

const DEFAULTS: Prefs = {
  defaultSymbol: DEFAULT_WATCHLIST_SYMBOLS[0],
  timeFormat: '24h',
  reduceMotion: false,
};

interface UsePreferencesArgs {
  watchlist: string[];
  initialPrefs?:
    | {
        defaultSymbol?: string | null;
        timeFormat?: string | null;
        reduceMotion?: boolean | null;
      }
    | undefined;
}

export function usePreferences({ watchlist, initialPrefs }: UsePreferencesArgs) {
  // Migrate from the legacy unversioned key once.
  useEffect(() => {
    migrateLocalStorageKey('hamafx:prefs', STORAGE_KEY);
  }, []);

  const [prefs, setPrefs, hydrated] = useLocalStorage<Prefs>(STORAGE_KEY, DEFAULTS);

  const update = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    [setPrefs],
  );

  // Single sync effect covering what used to be two separate effects:
  //   1. Always write the server value to localStorage (DB is source of
  //      truth) — resolves drift from cross-device changes.
  //   2. Apply reduce-motion to the document and sanitise defaultSymbol
  //      so a hard refresh and cross-tab sync respect the saved value.
  useEffect(() => {
    if (!hydrated) return;

    if (initialPrefs) {
      const merged: Prefs = {
        defaultSymbol: (initialPrefs.defaultSymbol ?? DEFAULTS.defaultSymbol) as Symbol,
        timeFormat: (initialPrefs.timeFormat ?? DEFAULTS.timeFormat) as '12h' | '24h',
        reduceMotion: initialPrefs.reduceMotion ?? DEFAULTS.reduceMotion,
      };
      // Only write if different to avoid unnecessary localStorage sets
      if (
        prefs.defaultSymbol !== merged.defaultSymbol ||
        prefs.timeFormat !== merged.timeFormat ||
        prefs.reduceMotion !== merged.reduceMotion
      ) {
        setPrefs(merged);
      }
    }

    document.documentElement.dataset.reduceMotion = prefs.reduceMotion ? 'force' : 'auto';

    // Sanitize defaultSymbol from localStorage using isSymbol and ensuring it is present in the watchlist
    if (!isKnownSymbol(prefs.defaultSymbol) || !watchlist.includes(prefs.defaultSymbol)) {
      const defaultSym = watchlist.includes(DEFAULT_WATCHLIST_SYMBOLS[0])
        ? DEFAULT_WATCHLIST_SYMBOLS[0]
        : watchlist[0] || DEFAULTS.defaultSymbol;
      // Avoid infinite updates if it is already matching
      if (prefs.defaultSymbol !== defaultSym) {
        update('defaultSymbol', defaultSym);
      }
    }
  }, [hydrated, initialPrefs, prefs, setPrefs, watchlist, update]);

  function syncToDb<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    update(key, value);
    const payload: Record<string, unknown> = {};
    payload[key] = value;
    updateUIPrefsAction(payload as Parameters<typeof updateUIPrefsAction>[0]);
  }

  return { prefs, hydrated, syncToDb };
}
