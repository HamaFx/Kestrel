// SPDX-License-Identifier: Apache-2.0

// Human-readable rule summary for an alert, used in rows and confirm dialogs.
import type { Alert } from '@kestrel/shared';

export function describeAlert(a: Alert): string {
  const r = a.rule;
  switch (r.type) {
    case 'priceCross':
      return `${r.symbol} price ${r.direction} ${r.level}`;
    case 'candleClose':
      return `${r.symbol} ${r.tf.toUpperCase()} close ${r.direction} ${r.level}`;
    case 'indicatorCross':
      return `${r.symbol} ${r.tf.toUpperCase()} ${r.indicator.toUpperCase()} ${r.direction} ${r.level}`;
  }
}
