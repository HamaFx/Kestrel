/**
 * Local zero-network replacements for jslib.k6.io utilities.
 */

export function randomItem<T>(arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error('randomItem called on empty array');
  }
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx]!;
}

export function uuidv4(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[Math.floor(Math.random() * 4) + 8]!;
    } else {
      out += hex[Math.floor(Math.random() * 16)]!;
    }
  }
  return out;
}

export function formatTextSummary(data: Record<string, any>): string {
  const lines: string[] = ['=== Kestrel k6 Load Test Summary ==='];
  const metrics = (data.metrics ?? {}) as Record<
    string,
    { values?: Record<string, number>; thresholds?: Record<string, { ok?: boolean }> }
  >;
  for (const [name, metric] of Object.entries(metrics)) {
    const vals = metric.values ?? {};
    const parts = Object.entries(vals)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : String(v)}`)
      .join(' ');
    const thresholds = metric.thresholds ?? {};
    const breached = Object.entries(thresholds)
      .filter(([, th]) => th.ok === false)
      .map(([thName]) => thName);
    const status = breached.length > 0 ? ` [BREACHED: ${breached.join(', ')}]` : '';
    lines.push(`  ${name}: ${parts}${status}`);
  }
  return lines.join('\n');
}
