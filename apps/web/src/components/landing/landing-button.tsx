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

import { Button, TacticalButtonChrome } from '@/components/ui/button';
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
  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          'group tactile-press hover:border-brand/50 focus-visible:ring-brand focus-visible:ring-offset-bg relative inline-flex items-center overflow-hidden rounded-l-[6px] rounded-r-full border border-white/12 bg-[#222326] py-[0.72em] pr-[3.4em] pl-[1.25em] font-sans text-[14px] leading-none font-medium tracking-[-0.02em] text-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.14)] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 select-none',
          className,
        )}
      >
        <TacticalButtonChrome>{label}</TacticalButtonChrome>
      </Link>
    );
  }

  return (
    <Button variant="tactical" onClick={onClick} className={className}>
      {label}
    </Button>
  );
}
