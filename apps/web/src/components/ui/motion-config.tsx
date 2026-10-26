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

// Motion (formerly framer-motion) root provider.
//
// LazyMotion + domAnimation = ~25KB gz, vs the full bundle ~40KB. We use
// `m` instead of `motion` everywhere to take advantage of the lazy load.
//
// `reducedMotion="user"` automatically respects the user's OS-level
// prefers-reduced-motion setting and skips animations to their final state.
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

interface MotionRootProps {
  children: ReactNode;
}

/**
 * Emil Kowalski 4-tier motion presets for Kestrel.
 * Micro: <120ms (keys, toggles, chips)
 * Panel: ~240ms (drawers, modals, popovers, composer)
 * Layout: ~200ms (FLIP tab indicators, reordering)
 * Delight: ~380ms (confirmations, milestones)
 */
export const MOTION_PRESETS = {
  micro: { type: 'spring', stiffness: 650, damping: 38, mass: 0.8 },
  panel: { type: 'spring', stiffness: 420, damping: 30, mass: 1 },
  layout: { type: 'spring', stiffness: 350, damping: 32, mass: 1 },
  delight: { type: 'spring', stiffness: 280, damping: 18, mass: 1 },
} as const;

export function MotionRoot({ children }: MotionRootProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        transition={MOTION_PRESETS.panel}
        reducedMotion="user"
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
