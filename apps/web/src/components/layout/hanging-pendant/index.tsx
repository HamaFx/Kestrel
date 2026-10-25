// SPDX-License-Identifier: Apache-2.0

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
import { useRef } from 'react';

import { usePendantSimulation } from './use-pendant-simulation';

/**
 * 5-node Verlet physics hanging charm matching Hoplite's sidebar pendant.
 * Renders on a high-DPI canvas with interactive cursor repulsion and gravitational damping.
 */
export function HangingPendant({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  usePendantSimulation(canvasRef);

  return (
    <div className={className} title="Interactive pendant physics">
      <canvas
        ref={canvasRef}
        style={{ width: 64, height: 130 }}
        className="cursor-grab select-none active:cursor-grabbing"
      />
    </div>
  );
}
