'use client';

// SPDX-License-Identifier: Apache-2.0

// Keyboard navigation + initial focus for the regenerate model menu.
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

interface UseModelMenuKeyboardResult {
  containerRef: RefObject<HTMLDivElement | null>;
  handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export function useModelMenuKeyboard({
  loading,
  activeModelId,
  popoverId,
}: {
  loading: boolean;
  activeModelId?: string | null | undefined;
  popoverId: string;
}): UseModelMenuKeyboardResult {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation and initial focus
  useEffect(() => {
    if (!loading && containerRef.current) {
      const items = Array.from(
        containerRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
      );
      const activeItem = items.find((item) => item.getAttribute('data-model-id') === activeModelId);
      if (activeItem) {
        activeItem.focus();
      } else if (items[0]) {
        items[0].focus();
      }
    }
  }, [loading, activeModelId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const items = Array.from(
      containerRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
    );
    if (items.length === 0) return;

    const activeEl = document.activeElement as HTMLButtonElement;
    const currentIndex = items.indexOf(activeEl);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        items[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        const popover = document.getElementById(popoverId);
        (popover as HTMLElement | null)?.hidePopover?.();
        // Return focus to the trigger button if it exists
        const trigger = document.querySelector(
          `[popovertarget="${popoverId}"]`,
        ) as HTMLElement | null;
        trigger?.focus();
        break;
      }
      default:
        break;
    }
  };

  return { containerRef, handleKeyDown };
}
