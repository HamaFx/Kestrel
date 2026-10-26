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

// <SpotlightCard> — EasyUI / 21st.dev interactive cursor-tracking spotlight card.
// Follows cursor with a subtle Forge Flame luminescence and dynamic border glow.
import { useCallback, useRef, useState, type HTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  spotlightColor?: string;
  className?: string;
}

export function SpotlightCard({
  children,
  spotlightColor = 'rgba(255, 54, 22, 0.12)',
  className,
  ...props
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setOpacity(1);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setOpacity(0);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141416]/90 p-4 transition-all duration-300',
        'shadow-[0_8px_32px_-8px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)]',
        'hover:border-white/[0.14] hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.95)]',
        className,
      )}
      {...props}
    >
      {/* Radial Cursor Spotlight Glow */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* Dynamic Cursor Border Highlight */}
      <div
        className="border-brand/30 pointer-events-none absolute -inset-px rounded-2xl border transition-opacity duration-300"
        style={{
          opacity,
          maskImage: `radial-gradient(280px circle at ${position.x}px ${position.y}px, black, transparent 80%)`,
          WebkitMaskImage: `radial-gradient(280px circle at ${position.x}px ${position.y}px, black, transparent 80%)`,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10">{children}</div>
    </div>
  );
}
