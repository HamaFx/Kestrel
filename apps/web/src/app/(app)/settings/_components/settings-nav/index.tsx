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
import { usePathname } from 'next/navigation';

import { SettingsBreadcrumb } from './breadcrumb';
import { SettingsDesktopNav } from './desktop-nav';
import { SettingsMobileNav } from './mobile-nav';
import { BASE_NAV_GROUPS, isNavItemActive } from './nav-groups';

export type { NavGroup, NavItem } from './nav-groups';

export function SettingsNav() {
  const pathname = usePathname();
  const isSubPage = pathname !== '/settings';

  const groups = BASE_NAV_GROUPS;
  const allItems = groups.flatMap((g) => g.items);
  const currentItem = allItems.find((item) => isNavItemActive(item, pathname));

  const activeGroup =
    groups.find((g) => g.items.some((item) => isNavItemActive(item, pathname))) ?? groups[0]!;

  return (
    <div className="flex shrink-0 flex-col gap-3 md:w-60 lg:w-64">
      {/* Breadcrumb for subpages on desktop & mobile */}
      <SettingsBreadcrumb isSubPage={isSubPage} currentItem={currentItem} />

      {/* MOBILE NAVIGATION: Two-tier grouped navigation (< md) */}
      <SettingsMobileNav groups={groups} activeGroup={activeGroup} pathname={pathname} />

      {/* DESKTOP NAVIGATION: Grouped sidebar (>= md) */}
      <SettingsDesktopNav groups={groups} pathname={pathname} />
    </div>
  );
}
