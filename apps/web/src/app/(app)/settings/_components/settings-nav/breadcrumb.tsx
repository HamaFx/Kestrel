'use client';

// SPDX-License-Identifier: Apache-2.0

// Breadcrumb shown above the settings nav on subpages.
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import type { NavItem } from './nav-groups';

export function SettingsBreadcrumb({
  isSubPage,
  currentItem,
}: {
  isSubPage: boolean;
  currentItem: NavItem | undefined;
}) {
  if (!isSubPage) return null;

  return (
    <nav aria-label="Breadcrumb" className="text-fg-subtle flex items-center gap-1.5 text-xs">
      <Link
        href="/settings"
        className="hover:text-fg inline-flex shrink-0 items-center gap-1.5 transition-colors"
      >
        <IconArrowLeft className="size-3.5" />
        Settings
      </Link>
      {currentItem && (
        <>
          <IconChevronRight className="text-fg-subtle/60 size-3 shrink-0" aria-hidden />
          <span className="text-fg truncate font-medium" aria-current="page">
            {currentItem.label}
          </span>
        </>
      )}
    </nav>
  );
}
