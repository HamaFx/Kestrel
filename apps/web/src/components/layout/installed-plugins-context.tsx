'use client';

// SPDX-License-Identifier: Apache-2.0

// Installed plugin ids for the current user, shared with client surfaces that
// adapt plugin UI slots (chat composer slash commands).
// The app shell resolves the list once per request and provides it here; the
// default is `null` ("not provided"), which callers treat as unknown — outside
// the shell nothing is disabled, while inside it plugins can be gated exactly.
import { createContext, useContext, type ReactNode } from 'react';

const InstalledPluginsContext = createContext<readonly string[] | null>(null);

export function InstalledPluginsProvider({
  installedPluginIds,
  children,
}: {
  installedPluginIds: readonly string[];
  children: ReactNode;
}) {
  return (
    <InstalledPluginsContext.Provider value={installedPluginIds}>
      {children}
    </InstalledPluginsContext.Provider>
  );
}

/**
 * Enabled plugin ids for the current user.
 *
 * Returns `null` when the app shell has not provided the list (public routes,
 * isolated tests), which callers treat as "unknown — do not gate".
 */
export function useInstalledPluginIds(): readonly string[] | null {
  return useContext(InstalledPluginsContext);
}
