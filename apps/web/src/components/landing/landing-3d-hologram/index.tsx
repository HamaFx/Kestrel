'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Landing hero 3D hologram mount. Scene construction, pointer physics and
// the render loop live in sibling modules; this shell wires them into one
// client-only WebGL canvas.
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/formatters/cn';

import { startHologramAnimation } from './animation';
import { attachHologramControls } from './controls';
import { createHologramScene } from './scene';

interface Props {
  className?: string;
}

export function Landing3DHologram({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 380;
    const height = container.clientHeight || 380;

    const hologramScene = createHologramScene(container, width, height);
    if (!hologramScene) return;

    const controls = attachHologramControls(container, hologramScene.masterGroup);
    const stopAnimation = startHologramAnimation(hologramScene, controls);

    return () => {
      stopAnimation();
      controls.detach();
      hologramScene.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mx-auto aspect-square w-full max-w-[420px] cursor-grab touch-none select-none active:cursor-grabbing',
        className,
      )}
    />
  );
}
