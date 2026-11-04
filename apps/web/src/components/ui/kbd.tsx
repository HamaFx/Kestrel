// SPDX-License-Identifier: Apache-2.0

// Shared keyboard keycap. One utility, one size, every shortcut hint.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('kbd-keycap', className)}>{children}</kbd>;
}
