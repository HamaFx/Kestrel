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

// Model picker backed by the core BYOK catalog. Only providers the user has
// configured appear (the endpoint is fail-closed), so a saved model is always
// resolvable.
import { useEffect, useState } from 'react';

interface CatalogModel {
  modelId: string;
  label?: string;
  capabilities?: { embedding?: boolean };
}
interface CatalogProvider {
  id: string;
  displayName: string;
  models: CatalogModel[];
}
interface CatalogResponse {
  providers: CatalogProvider[];
}

let cache: { at: number; value: CatalogResponse } | null = null;

async function loadCatalog(): Promise<CatalogResponse> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const response = await fetch('/api/settings/catalog', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value = (await response.json()) as CatalogResponse;
  cache = { at: Date.now(), value };
  return value;
}

const selectClass =
  'border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 h-9 w-full rounded-md border px-2.5 text-xs outline-none';

export function ModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(cache?.value ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (catalog) return;
    let cancelled = false;
    loadCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  const providers =
    catalog?.providers
      .map((provider) => ({
        ...provider,
        models: provider.models.filter((model) => !model.capabilities?.embedding),
      }))
      .filter((provider) => provider.models.length > 0) ?? [];
  const known = providers.some((provider) =>
    provider.models.some((model) => `${provider.id}:${model.modelId}` === value),
  );

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled}
        className={selectClass}
        aria-label="Agent model"
      >
        <option value="">Use my chat model (recommended)</option>
        {value && !known ? <option value={value}>{value} (not in catalog)</option> : null}
        {providers.map((provider) => (
          <optgroup key={provider.id} label={provider.displayName}>
            {provider.models.map((model) => (
              <option key={model.modelId} value={`${provider.id}:${model.modelId}`}>
                {model.label ?? model.modelId}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error ? (
        <span className="text-fg-subtle text-[10px]">
          Model catalog unavailable ({error}); the agent will use your chat model.
        </span>
      ) : null}
    </div>
  );
}
