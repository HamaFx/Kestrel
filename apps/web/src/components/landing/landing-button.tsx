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
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

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
  const innerElements = (
    <>
      {/* Triple-Layer Expanding Orange Flame Glow (Hoplite Signature) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[0.45em] right-[0.45em] h-[1.45em] w-[5.2em] rounded-full bg-[#ff4800]/22 blur-[0.45em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[9.2em]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[0.45em] right-[0.45em] h-[1.45em] w-[3.4em] rounded-full bg-[#ff632a]/60 blur-[0.42em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[9.2em]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[0.45em] right-[0.45em] h-[1.45em] w-[1.85em] rounded-full bg-[#ff3616] blur-[0.36em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[9.2em]"
      />

      {/* Button Text */}
      <span className="relative z-10 font-semibold">{label}</span>

      {/* 5-Cross Expanding Grid Icon (Hoplite Signature Arrow Grid) */}
      <svg
        viewBox="0 0 12 12"
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none absolute top-1/2 right-[0.9em] z-10 size-[0.85em] -translate-y-1/2 text-white"
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
    </>
  );

  const sharedClasses = cn(
    'group tactile-press relative inline-flex items-center overflow-hidden rounded-l-[6px] rounded-r-full border border-white/12 bg-[#222326] py-[0.72em] pr-[3.4em] pl-[1.25em] font-sans text-[14px] font-medium leading-none tracking-[-0.02em] text-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14)] transition-all duration-300 hover:border-brand/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 select-none',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={sharedClasses} onClick={onClick}>
        {innerElements}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={sharedClasses}>
      {innerElements}
    </button>
  );
}
