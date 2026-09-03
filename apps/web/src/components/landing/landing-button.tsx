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

import Link from 'next/link';
import { cn } from '@/lib/cn';

interface TacticalFlameButtonProps {
  href?: string;
  label?: string;
  className?: string;
  onClick?: () => void;
}

export function TacticalFlameButton({
  href = '/login',
  label = 'Launch Terminal',
  className,
  onClick,
}: TacticalFlameButtonProps) {
  const content = (
    <span
      className={cn(
        'group relative inline-flex items-center overflow-hidden rounded-l-[6px] rounded-r-full bg-[#202224] py-[0.72em] pr-[3.4em] pl-[1.25em] text-[14px] font-sans font-medium leading-none tracking-[-0.02em] text-white border border-white/10 transition-transform duration-300 active:scale-[0.98] shadow-lg cursor-pointer hover:border-brand/40',
        className,
      )}
      onClick={onClick}
    >
      {/* Triple-Layer Expanding Orange Flame Glow (Hoplite Signature) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[0.45em] right-[0.45em] h-[1.45em] w-[5.2em] rounded-full bg-[#ff4800]/20 blur-[0.45em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[9em]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[0.45em] right-[0.45em] h-[1.45em] w-[3.4em] rounded-full bg-[#ff632a]/60 blur-[0.45em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[9em]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[0.45em] right-[0.45em] h-[1.45em] w-[1.85em] rounded-full bg-[#ff3616] blur-[0.45em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[9em]"
      />

      {/* Button Text */}
      <span className="relative z-10 font-semibold">{label}</span>

      {/* 5-Cross Expanding Grid Icon (Hoplite Signature Arrow Grid) */}
      <svg
        viewBox="0 0 12 12"
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none absolute top-1/2 right-[0.9em] size-[0.85em] -translate-y-1/2 text-white z-10"
        aria-hidden="true"
      >
        <rect
          x="0"
          y="5"
          width="2"
          height="2"
          rx="0.5"
          fill="currentColor"
          className="transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:[width:12px]"
        />
        <rect
          x="5"
          y="0"
          width="2"
          height="2"
          rx="0.5"
          fill="currentColor"
          className="transition-[height] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:[height:12px]"
        />
        <rect x="5" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
        <rect x="5" y="10" width="2" height="2" rx="0.5" fill="currentColor" />
        <rect x="10" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
      </svg>
    </span>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
