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

// SPDX-License-Identifier: Apache-2.0

'use client';

import { IconLoader2, IconPlus } from '@tabler/icons-react';
import { useRef, useState } from 'react';

import { fetchCsrf } from '@/lib/csrf';

interface TopupProduct {
  id: string;
  name: string;
  credits: number;
  priceUsdCents: number;
  stripePriceId?: string | null;
}

export function TopupPacks({
  products,
  provider,
}: {
  products: TopupProduct[];
  provider: 'stripe' | 'nowpayments';
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  async function buy(product: TopupProduct) {
    setError(null);
    setLoading(product.id);
    try {
      const key = keys.current.get(product.id) ?? crypto.randomUUID();
      keys.current.set(product.id, key);
      const res = await fetchCsrf('/api/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ productId: product.id, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Top-up failed');
        return;
      }
      if (data.checkoutUrl) {
        keys.current.delete(product.id);
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed');
    } finally {
      setLoading(null);
    }
  }

  if (products.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-fg text-sm font-semibold">Top up credits</h3>
        <p className="text-fg-subtle text-xs">
          Packs roll over and never expire. Use them after your monthly allowance.
        </p>
      </div>
      {error && (
        <div className="border-danger/30 bg-danger/10 text-danger rounded-sm border px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => buy(product)}
            disabled={loading !== null || (provider === 'stripe' && !product.stripePriceId)}
            className="border-border bg-bg-elev-1 hover:border-brand/40 flex flex-col items-start gap-1 rounded-sm border p-4 text-left transition-colors disabled:opacity-50"
          >
            <span className="text-fg flex items-center gap-1.5 text-sm font-semibold">
              {loading === product.id ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconPlus className="size-4" />
              )}
              {product.name}
            </span>
            <span className="text-fg-subtle text-xs">
              {product.credits.toLocaleString()} credits
            </span>
            <span className="text-fg mt-1 text-lg font-bold">
              ${(product.priceUsdCents / 100).toFixed(2)}
            </span>
            {provider === 'stripe' && !product.stripePriceId && (
              <span className="text-fg-subtle text-[10px]">Stripe price not configured</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
