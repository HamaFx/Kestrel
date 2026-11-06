// SPDX-License-Identifier: Apache-2.0

// Shared geometry and formatting helpers for Kestrel chart primitives.
export interface ChartPoint {
  x: number;
  y: number;
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
