// SPDX-License-Identifier: Apache-2.0

// Shared geometry and formatting helpers for the Kestrel chart primitives.
export interface ChartPoint {
  x: number;
  y: number;
}

function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(Math.max(raw, Number.EPSILON)));
  const fraction = raw / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

/** Round a domain out to readable tick values. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = niceStep((max - min) / Math.max(1, count));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(8)));
  }
  return ticks;
}

/** Catmull-Rom-to-Bezier smoothing for the analytical curves. */
export function smoothPath(points: readonly ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(' ');
  }

  let path = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[index + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

export interface ProfitLossGeometry {
  yFor: (value: number) => number;
  xFor: (index: number) => number;
  line: string;
  area: string;
  shade: string | null;
  baselineY: number;
  ticks: number[];
}

export const CHART_Y_TOP = 8;
export const CHART_Y_BOTTOM = 92;

export function buildProfitLossGeometry(
  values: readonly number[],
  ceilingValues: readonly number[] | undefined,
  baseline: number,
): ProfitLossGeometry {
  const ceiling = ceilingValues?.length === values.length ? ceilingValues : null;
  const all = [...values, ...(ceiling ?? []), baseline];
  const low = Math.min(...all);
  const high = Math.max(...all);
  const pad = (high - low) * 0.08 || Math.abs(high || 1) * 0.1 || 1;
  const min = low - pad;
  const max = high + pad;
  const span = max - min || 1;
  const yFor = (value: number) =>
    CHART_Y_TOP + (1 - (value - min) / span) * (CHART_Y_BOTTOM - CHART_Y_TOP);
  const xFor = (index: number) => (index / Math.max(values.length - 1, 1)) * 100;

  const points: ChartPoint[] = values.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
  const line = smoothPath(points);
  const baselineY = yFor(baseline);
  const area = `${line} L 100 ${baselineY.toFixed(2)} L 0 ${baselineY.toFixed(2)} Z`;

  let shade: string | null = null;
  if (ceiling) {
    const ceilingPoints = ceiling.map(
      (value, index) => `${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`,
    );
    shade = `${line} ${ceilingPoints
      .reverse()
      .map((point) => `L ${point}`)
      .join(' ')} Z`;
  }

  return {
    yFor,
    xFor,
    line,
    area,
    shade,
    baselineY,
    ticks: niceTicks(min, max, 4),
  };
}

/** Compact axis numbers without losing the sign. */
export function formatAxisValue(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}m`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}k`;
  if (absolute >= 10) return `${sign}${absolute.toFixed(0)}`;
  if (absolute >= 1) return `${sign}${absolute.toFixed(1)}`;
  return `${sign}${absolute.toFixed(2)}`;
}
