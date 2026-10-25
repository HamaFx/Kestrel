'use client';

// SPDX-License-Identifier: Apache-2.0

// Search field for the conversation switcher drawer.
import { IconSearch } from '@tabler/icons-react';

export function ThreadSearchInput({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="px-4 pb-3">
      <label htmlFor="thread-search" className="sr-only">
        Search conversations
      </label>
      <div className="relative">
        <IconSearch
          aria-hidden="true"
          className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          id="thread-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search…"
          className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-border border-border h-11 w-full rounded-sm border pr-4 pl-10 text-sm focus:outline-none"
        />
      </div>
    </div>
  );
}
