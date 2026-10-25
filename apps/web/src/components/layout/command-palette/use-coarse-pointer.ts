// SPDX-License-Identifier: Apache-2.0
// Reports whether the current device uses a coarse (touch) pointer, so the
// palette can render its touch-only launcher button.

import { useEffect, useState } from 'react';

export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsCoarse(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  return isCoarse;
}
