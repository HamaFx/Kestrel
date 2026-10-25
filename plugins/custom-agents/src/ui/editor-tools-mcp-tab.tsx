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
import { IconPlus, IconTrash } from '@tabler/icons-react';

import { inputClass, TOOL_GROUP_LABELS } from './editor-types';
import type { AgentEditorController } from './use-agent-editor';

export function EditorToolsMcpTab({ editor }: { editor: AgentEditorController }) {
  const {
    catalog,
    form,
    patch,
    groupedTools,
    toolQuery,
    setToolQuery,
    toggleTool,
    addMcpRow,
    updateMcpRow,
    removeMcpRow,
  } = editor;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-fg text-xs font-semibold">Allowed tools</h3>
          <span className="text-fg-subtle text-[10px]">{form.tools.length} selected</span>
        </div>
        <input
          value={toolQuery}
          onChange={(event) => setToolQuery(event.target.value)}
          placeholder="Search tools…"
          className={inputClass}
        />
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
          {groupedTools.map(([group, list]) => (
            <div key={group} className="flex flex-col gap-1">
              <h4 className="text-fg-subtle text-[10px] font-semibold tracking-wide uppercase">
                {TOOL_GROUP_LABELS[group] ?? group}
              </h4>
              {list.map((tool) => {
                const isWrite = tool.access === 'write';
                const disabled =
                  isWrite && !catalog.settings.allowWriteTools && !form.tools.includes(tool.name);
                return (
                  <label
                    key={tool.name}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 ${
                      form.tools.includes(tool.name)
                        ? 'border-brand/40 bg-brand/5'
                        : 'border-border/50 hover:bg-bg-elev-2/40'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.tools.includes(tool.name)}
                      disabled={disabled}
                      onChange={() => toggleTool(tool.name)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="text-fg flex items-center gap-1.5 font-mono text-[11px] font-semibold">
                        {tool.name}
                        {isWrite ? (
                          <span className="border-warn/30 bg-warn/10 text-warn rounded border px-1 text-[9px] font-semibold uppercase">
                            write
                          </span>
                        ) : null}
                      </span>
                      <span className="text-fg-subtle line-clamp-2 block text-[10px]">
                        {tool.description}
                      </span>
                      {disabled ? (
                        <span className="text-warn block text-[10px]">
                          Enable “Allow write tools” in plugin settings to attach this.
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
          {groupedTools.length === 0 ? (
            <p className="text-fg-subtle text-[11px]">No tools match that search.</p>
          ) : null}
        </div>
      </section>

      <label className="border-border/60 flex items-start gap-2 rounded-md border p-2.5">
        <input
          type="checkbox"
          checked={form.delegatable}
          onChange={(event) => patch({ delegatable: event.target.checked })}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg block text-[11px] font-semibold">
            Allow Kestrel Main Chat to delegate to this agent
          </span>
          <span className="text-fg-subtle block text-[10px]">
            Delegated runs are read-only and never use MCP connections.
          </span>
        </span>
      </label>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-fg text-xs font-semibold">MCP servers</h3>
          <button
            type="button"
            onClick={addMcpRow}
            disabled={
              !catalog.settings.allowMcp || form.mcpServers.length >= catalog.settings.maxMcpServers
            }
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold disabled:opacity-40"
          >
            <IconPlus className="size-3" />
            Add server
          </button>
        </div>
        {!catalog.settings.allowMcp ? (
          <p className="text-fg-subtle text-[11px]">
            Remote MCP is disabled in Custom Agents settings.
          </p>
        ) : form.mcpServers.length === 0 ? (
          <p className="text-fg-subtle text-[11px]">
            No MCP servers. HTTPS only; private hosts are blocked unless the operator allows them.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {form.mcpServers.map((row, index) => (
              <li
                key={index}
                className="border-border/60 flex flex-col gap-1.5 rounded-md border p-2.5"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={row.id}
                    onChange={(event) =>
                      updateMcpRow(index, {
                        id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    placeholder="server-id"
                    className={`${inputClass} max-w-40 font-mono`}
                    maxLength={32}
                  />
                  <button
                    type="button"
                    aria-label="Remove MCP server"
                    onClick={() => removeMcpRow(index)}
                    className="text-fg-subtle hover:text-danger ml-auto inline-flex size-7 items-center justify-center rounded-md"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </div>
                <input
                  value={row.url}
                  onChange={(event) => updateMcpRow(index, { url: event.target.value })}
                  placeholder="https://mcp.example.com/mcp"
                  className={`${inputClass} font-mono`}
                  maxLength={2_000}
                />
                <input
                  value={row.authorization}
                  onChange={(event) => updateMcpRow(index, { authorization: event.target.value })}
                  placeholder={
                    row.hadAuthorization
                      ? 'Token stored — leave blank to keep'
                      : 'Authorization header (optional)'
                  }
                  className={`${inputClass} font-mono`}
                  maxLength={4_000}
                  type="password"
                />
                {row.hadAuthorization ? (
                  <label className="text-fg-subtle flex items-center gap-1.5 text-[10px]">
                    <input
                      type="checkbox"
                      checked={row.removeAuthorization}
                      onChange={(event) =>
                        updateMcpRow(index, { removeAuthorization: event.target.checked })
                      }
                    />
                    Remove the stored token
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
