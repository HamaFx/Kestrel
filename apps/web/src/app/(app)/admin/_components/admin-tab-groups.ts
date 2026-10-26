// SPDX-License-Identifier: Apache-2.0

// Domain groups for the Admin Control Plane.
//
// Sixteen sections used to sit in one `.no-scrollbar overflow-x-auto` strip,
// so on a 1280px viewport the last 7–8 tabs were clipped with no visual cue
// that they existed. The tab *registry* stays a flat array in `admin-tabs.ts`
// (keyboard navigation walks that order); this module owns the taxonomy and
// the grouping helper, and lives separately to keep every file inside the
// ≤250 LOC component budget.

export const TAB_GROUPS = [
  { id: 'access', label: 'Platform & Access' },
  { id: 'ops', label: 'System Operations' },
  { id: 'observability', label: 'Observability' },
  { id: 'eval', label: 'AI Quality & Eval' },
] as const;

export type TabGroupId = (typeof TAB_GROUPS)[number]['id'];

export interface AdminTabGroup<T> {
  group: (typeof TAB_GROUPS)[number];
  tabs: readonly T[];
}

/**
 * Bucket tabs by their `group` id, preserving both the group order above and
 * the flat registry order inside each group.
 */
export function groupAdminTabs<T extends { group: TabGroupId }>(
  tabs: readonly T[],
): ReadonlyArray<AdminTabGroup<T>> {
  return TAB_GROUPS.map((group) => ({
    group,
    tabs: tabs.filter((tab) => tab.group === group.id),
  }));
}
