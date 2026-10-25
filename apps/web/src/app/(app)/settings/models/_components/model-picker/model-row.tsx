'use client';

// SPDX-License-Identifier: Apache-2.0

// A single catalog model rendered as a `<select>` option, including the
// optional per-million-token price label.
import type { ModelOption } from './model-options';

export function ModelRow({ option }: { option: ModelOption }) {
  const priceLabel =
    option.inputPrice != null && option.outputPrice != null
      ? ` · $${option.inputPrice.toFixed(2)}/$${option.outputPrice.toFixed(2)}/1M tok`
      : '';
  return (
    <option value={option.value}>
      {option.providerLabel} · {option.label} ({option.tier}
      {priceLabel})
    </option>
  );
}
