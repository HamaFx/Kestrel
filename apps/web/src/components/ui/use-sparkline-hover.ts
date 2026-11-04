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

// SPDX-License-Identifier: Apache-2.0

// Pointer scrubbing for the shared sparkline. The sparkline itself is a
// stretched SVG, so the container rect is all we need: one linear map from
// `clientX` to a point index, no ResizeObserver and no floating tooltip.
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface SparklineHoverHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

/**
 * Track the point under the pointer inside a sparkline.
 *
 * `onHoverChange` receives the point index, or `null` when the pointer leaves.
 * Consumers update their existing numeric readout in place rather than
 * rendering a tooltip over neighbouring rows.
 */
export function useSparklineHover(
  length: number,
  onHoverChange?: (index: number | null) => void,
): {
  hoverIndex: number | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handlers: SparklineHoverHandlers;
} {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const update = useCallback(
    (next: number | null) => {
      setHoverIndex(next);
      onHoverChange?.(next);
    },
    [onHoverChange],
  );

  const indexFromClientX = useCallback(
    (clientX: number): number | null => {
      const element = containerRef.current;
      if (!element || length < 2) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (length - 1));
    },
    [length],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      update(indexFromClientX(event.clientX));
    },
    [indexFromClientX, update],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Mouse and pen scrub on hover; touch scrubs while the finger is down.
      if (event.pointerType === 'touch' && event.buttons === 0) return;
      update(indexFromClientX(event.clientX));
    },
    [indexFromClientX, update],
  );

  const clear = useCallback(() => update(null), [update]);

  return {
    hoverIndex,
    containerRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}
