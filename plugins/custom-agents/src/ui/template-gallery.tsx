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
import { IconLoader2, IconPlus, IconSparkles } from '@tabler/icons-react';

import type { CatalogOutput } from '../schemas';

export function TemplateGallery({
  templates,
  existingSlugs,
  busyId,
  onAdd,
}: {
  templates: CatalogOutput['templates'];
  existingSlugs: ReadonlySet<string>;
  busyId: string | null;
  onAdd: (templateId: string) => void;
}) {
  if (templates.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <IconSparkles className="text-brand size-4" />
        <h2 className="text-fg text-sm font-semibold">Start from a blueprint</h2>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => {
          const exists = existingSlugs.has(template.slug);
          return (
            <article
              key={template.id}
              className="surface-panel flex flex-col gap-1.5 rounded-xl border border-white/10 p-3"
            >
              <h3 className="text-fg text-xs font-semibold">{template.name}</h3>
              <p className="text-fg-subtle line-clamp-3 text-[10px]">{template.description}</p>
              <div className="text-fg-subtle mt-1 flex items-center justify-between gap-2 text-[10px]">
                <span className="font-mono">@{template.slug}</span>
                <button
                  type="button"
                  onClick={() => onAdd(template.id)}
                  disabled={exists || busyId !== null}
                  className="border-border/60 text-fg-muted hover:text-fg inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-40"
                >
                  {busyId === template.id ? (
                    <IconLoader2 className="size-3 animate-spin" />
                  ) : (
                    <IconPlus className="size-3" />
                  )}
                  {exists ? 'Added' : 'Add'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
