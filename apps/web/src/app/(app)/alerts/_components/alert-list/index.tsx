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

// Alerts list shell: header controls, row list with optimistic state, and the
// new-alert drawer.
import { useState } from 'react';

import { useConfirm } from '@/components/ui/confirm-drawer';

import { AlertListHeader } from './alert-list-header';
import { AlertsEmpty, AlertsError, AlertsFilteredEmpty, AlertsLoading } from './alert-list-states';
import { AlertRow } from './alert-row';
import { NewAlertDrawer } from './new-alert-drawer';
import { useAlerts } from './use-alerts';

export { ALERTS_QUERY_KEY } from './use-alerts';

export function AlertList() {
  const [open, setOpen] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    filter,
    setFilter,
    toggle,
    handleDelete,
    filteredAlerts,
    refresh,
  } = useAlerts(confirm);

  return (
    <div className="flex flex-col gap-4">
      <AlertListHeader
        filter={filter}
        onFilterChange={setFilter}
        showNew={!!data && data.alerts.length > 0}
        onNew={() => setOpen(true)}
        isFetching={isFetching && !isLoading}
      />

      {isLoading ? (
        <AlertsLoading />
      ) : isError ? (
        <AlertsError error={error} />
      ) : data?.alerts.length === 0 ? (
        <AlertsEmpty onNew={() => setOpen(true)} />
      ) : filteredAlerts?.length === 0 ? (
        <AlertsFilteredEmpty filter={filter} onShowAll={() => setFilter('all')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredAlerts?.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              onToggle={() => toggle.mutate({ id: a.id, active: !a.active })}
              onDelete={() => void handleDelete(a)}
            />
          ))}
        </ul>
      )}

      <NewAlertDrawer
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          refresh();
          setOpen(false);
        }}
      />

      {confirmEl}
    </div>
  );
}
