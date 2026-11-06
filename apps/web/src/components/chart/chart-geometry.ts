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

/**
 * Fritsch–Carlson monotone cubic Hermite interpolation for analytical curves.
 * Guarantees zero overshoot at local extrema and flat plateaus.
 */
export function smoothPath(points: readonly ChartPoint[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  if (n === 2) {
    return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)} L ${points[1]!.x.toFixed(2)} ${points[1]!.y.toFixed(2)}`;
  }

  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const dxi = p2.x - p1.x;
    const dyi = p2.y - p1.y;
    dx.push(dxi);
    dy.push(dyi);
    slopes.push(dxi !== 0 ? dyi / dxi : 0);
  }

  const tangents: number[] = new Array<number>(n).fill(0);
  tangents[0] = slopes[0] ?? 0;
  tangents[n - 1] = slopes[n - 2] ?? 0;

  for (let i = 1; i < n - 1; i++) {
    const s0 = slopes[i - 1] ?? 0;
    const s1 = slopes[i] ?? 0;
    if (s0 * s1 <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (s0 + s1) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const s = slopes[i] ?? 0;
    if (s === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = (tangents[i] ?? 0) / s;
      const beta = (tangents[i + 1] ?? 0) / s;
      const hypot = Math.hypot(alpha, beta);
      if (hypot > 3) {
        const tau = 3 / hypot;
        tangents[i] = tau * alpha * s;
        tangents[i + 1] = tau * beta * s;
      }
    }
  }

  let path = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const segDx = (dx[i] ?? 0) / 3;
    const cp1x = p1.x + segDx;
    const cp1y = p1.y + (tangents[i] ?? 0) * segDx;
    const cp2x = p2.x - segDx;
    const cp2y = p2.y - (tangents[i + 1] ?? 0) * segDx;
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

  const rawTicks = niceTicks(low, high, 4);
  const visibleTicks = rawTicks.filter((tick) => {
    const y = yFor(tick);
    return y >= CHART_Y_TOP - 2 && y <= CHART_Y_BOTTOM + 2;
  });

  return {
    yFor,
    xFor,
    line,
    area,
    shade,
    baselineY,
    ticks: visibleTicks.length > 0 ? visibleTicks : [low, high],
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
