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
import { useMemo } from 'react';

import type { AgentView, CatalogOutput } from '../../schemas';
import { AgentCard } from '../agent-card';
import { TemplateGallery } from '../template-gallery';

export function AgentCollection({
  agents,
  catalog,
  busyId,
  onAddTemplate,
  onEdit,
  onDelete,
  onChat,
  onRuns,
}: {
  agents: readonly AgentView[];
  catalog: CatalogOutput | null;
  busyId: string | null;
  onAddTemplate: (templateId: string) => void;
  onEdit: (agent: AgentView) => void;
  onDelete: (agent: AgentView) => void;
  onChat: (agent: AgentView) => void;
  onRuns: (agent: AgentView) => void;
}) {
  const existingSlugs = useMemo(() => new Set(agents.map((agent) => agent.slug)), [agents]);

  return (
    <>
      {catalog && agents.length === 0 ? (
        <TemplateGallery
          templates={catalog.templates}
          existingSlugs={existingSlugs}
          busyId={busyId}
          onAdd={onAddTemplate}
        />
      ) : null}

      {agents.length === 0 ? (
        <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-8 text-center text-xs">
          No agents yet. Add a blueprint above or build one from scratch.
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              busy={busyId === agent.id}
              onEdit={() => onEdit(agent)}
              onDelete={() => onDelete(agent)}
              onChat={() => onChat(agent)}
              onRuns={() => onRuns(agent)}
            />
          ))}
        </section>
      )}

      {catalog && agents.length > 0 ? (
        <TemplateGallery
          templates={catalog.templates.filter((template) => !existingSlugs.has(template.slug))}
          existingSlugs={existingSlugs}
          busyId={busyId}
          onAdd={onAddTemplate}
        />
      ) : null}
    </>
  );
}
