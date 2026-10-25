// SPDX-License-Identifier: Apache-2.0

// Formatting helpers for the automatic plugin tool card.

export const MAX_TABLE_ROWS = 5;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_PREVIEW_CHARS = 120;

export function humanizeToolName(name: string): string {
  return name
    .replace(/^tool-/, '')
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isScalar(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value)
      : String(value);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const text = String(value);
  return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}…` : text;
}

export function summarize(output: unknown): string {
  if (output === null || output === undefined) return 'no output';
  if (typeof output === 'string') return formatScalar(output);
  if (Array.isArray(output)) return `${output.length} item${output.length === 1 ? '' : 's'}`;
  if (isPlainObject(output)) {
    if (typeof output['message'] === 'string' && output['message'].length > 0) {
      return formatScalar(output['message']);
    }
    const scalars = Object.entries(output).filter(([, value]) => isScalar(value));
    if (scalars.length === 0) return `${Object.keys(output).length} fields`;
    return scalars
      .slice(0, 2)
      .map(([key, value]) => `${key} ${formatScalar(value)}`)
      .join(' · ');
  }
  return formatScalar(output);
}

export function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text === undefined) return String(value);
    return text.length > 8000 ? `${text.slice(0, 8000)}\n… (truncated)` : text;
  } catch {
    return String(value);
  }
}
