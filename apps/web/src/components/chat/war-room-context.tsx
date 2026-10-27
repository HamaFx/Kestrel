'use client';

// SPDX-License-Identifier: Apache-2.0

// Shares "the desktop War Room sidecar is open on the Council tab" with the
// inline message parts so they can collapse their duplicate 4-desk grid
// (review focus: zero duplicate committee cards on screen).
import { createContext, useContext, type ReactNode } from 'react';

const WarRoomOpenContext = createContext(false);

export function WarRoomOpenProvider({ open, children }: { open: boolean; children: ReactNode }) {
  return <WarRoomOpenContext.Provider value={open}>{children}</WarRoomOpenContext.Provider>;
}

export function useWarRoomOpen(): boolean {
  return useContext(WarRoomOpenContext);
}
