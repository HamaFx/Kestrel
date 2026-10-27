// SPDX-License-Identifier: Apache-2.0
// Reports whether the current device uses a coarse (touch) pointer, so the
// palette can render its touch-only launcher button.
//
// The query is watched, not sampled once: rotating a 2-in-1, plugging in a
// mouse, or detaching a tablet keyboard changes the pointer while the app is
// open, and a launcher that only appears after a reload reads as a bug.

import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    setIsCoarse(query.matches);

    const onChange = (event: MediaQueryListEvent): void => setIsCoarse(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isCoarse;
}
