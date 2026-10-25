// SPDX-License-Identifier: Apache-2.0

// Structured renderers for an automatic plugin tool payload: scalar grid,
// tables, chip lists, object blocks, and the raw JSON payload.

import {
  formatScalar,
  isPlainObject,
  isScalar,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  safeStringify,
} from './auto-plugin-tool-format';

export function PluginOutput({ output }: { output: unknown }) {
  if (output === null || output === undefined) {
    return <p className="text-fg-muted text-body-sm">No output was returned.</p>;
  }

  if (isPlainObject(output)) {
    const scalarEntries = Object.entries(output).filter(([, value]) => isScalar(value));
    const arrayEntries = Object.entries(output).filter((entry): entry is [string, unknown[]] =>
      Array.isArray(entry[1]),
    );
    const objectEntries = Object.entries(output).filter(
      (entry): entry is [string, Record<string, unknown>] => isPlainObject(entry[1]),
    );

    return (
      <div className="space-y-3">
        {scalarEntries.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {scalarEntries.map(([key, value]) => (
              <div key={key} className="flex min-w-0 items-baseline justify-between gap-3">
                <dt className="text-fg-subtle shrink-0 font-mono text-[11px] tracking-wide uppercase">
                  {key.replaceAll('_', ' ')}
                </dt>
                <dd className="text-fg truncate text-right font-mono text-xs tabular-nums">
                  {formatScalar(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {arrayEntries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            {shouldRenderTable(value) ? (
              <TableBlock label={key} rows={value as Array<Record<string, unknown>>} />
            ) : (
              <ChipBlock label={key} values={value} />
            )}
          </div>
        ))}

        {objectEntries.map(([key, value]) => (
          <ObjectBlock key={key} label={key} value={value} />
        ))}

        <RawPayload output={output} />
      </div>
    );
  }

  if (Array.isArray(output)) {
    return (
      <div className="space-y-3">
        {shouldRenderTable(output) ? (
          <TableBlock label="items" rows={output as Array<Record<string, unknown>>} />
        ) : (
          <ChipBlock label="items" values={output} />
        )}
        <RawPayload output={output} />
      </div>
    );
  }

  return <p className="text-fg text-body-sm font-mono tabular-nums">{formatScalar(output)}</p>;
}

function shouldRenderTable(value: unknown[]): boolean {
  return value.length > 0 && value.every((row) => isPlainObject(row));
}

function TableBlock({ label, rows }: { label: string; rows: Array<Record<string, unknown>> }) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(
    0,
    MAX_TABLE_COLUMNS,
  );
  const visible = rows.slice(0, MAX_TABLE_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <div className="min-w-0">
      <BlockLabel label={label} meta={`${rows.length} row${rows.length === 1 ? '' : 's'}`} />
      <div className="border-divider overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
          <thead className="bg-bg-elev-2">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="text-fg-subtle px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase"
                >
                  {column.replaceAll('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={index} className="border-divider border-t">
                {columns.map((column) => (
                  <td key={column} className="text-fg max-w-48 truncate px-2 py-1.5">
                    {isScalar(row[column])
                      ? formatScalar(row[column])
                      : formatScalar(JSON.stringify(row[column]))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 ? (
        <p className="text-fg-subtle text-caption mt-1">
          +{hidden} more row{hidden === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}

function ChipBlock({ label, values }: { label: string; values: unknown[] }) {
  const visible = values.slice(0, 8);
  return (
    <div>
      <BlockLabel label={label} meta={`${values.length}`} />
      <div className="flex flex-wrap gap-1.5">
        {visible.map((value, index) => (
          <span
            key={index}
            className="bg-bg-elev-2 text-fg-muted rounded-md px-2 py-0.5 font-mono text-[11px] tabular-nums"
          >
            {formatScalar(value)}
          </span>
        ))}
        {values.length > visible.length ? (
          <span className="text-fg-subtle px-1 font-mono text-[11px]">
            +{values.length - visible.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ObjectBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <details className="group">
      <summary className="text-fg-subtle hover:text-fg cursor-pointer list-none font-mono text-[11px] tracking-wide uppercase">
        {label.replaceAll('_', ' ')}
      </summary>
      <pre className="bg-bg-elev-2 text-fg-muted mt-1.5 max-h-48 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
        {safeStringify(value)}
      </pre>
    </details>
  );
}

function BlockLabel({ label, meta }: { label: string; meta: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-fg-subtle font-mono text-[11px] tracking-wide uppercase">
        {label.replaceAll('_', ' ')}
      </span>
      <span className="text-fg-subtle font-mono text-[11px] tabular-nums">{meta}</span>
    </div>
  );
}

function RawPayload({ output }: { output: unknown }) {
  return (
    <details className="group">
      <summary className="text-fg-subtle hover:text-fg cursor-pointer list-none font-mono text-[11px] tracking-wide uppercase">
        raw payload
      </summary>
      <pre className="bg-bg-elev-2 text-fg-muted mt-1.5 max-h-56 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
        {safeStringify(output)}
      </pre>
    </details>
  );
}
