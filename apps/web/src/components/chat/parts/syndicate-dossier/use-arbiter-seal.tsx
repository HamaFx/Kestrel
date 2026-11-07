'use client';

// SPDX-License-Identifier: Apache-2.0

// Execution side of the Arbiter's Seal: logs the certified plan to the journal
// and arms invalidation + target price alerts in parallel. Kept separate from
// the sizer UI so neither file owns two responsibilities.
import { Link } from 'next-view-transitions';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { apiMutate } from '@/lib/http/api-client';

export interface SealPlanArgs {
  symbol: string;
  planId: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  stop: number;
  tp1: number | null;
  tp2: number | null;
  sizeLots: number;
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export function useArbiterSeal(args: SealPlanArgs) {
  const { symbol, planId, direction, entry, stop, tp1, tp2, sizeLots } = args;
  const [sealing, setSealing] = useState(false);
  const [sealed, setSealed] = useState(false);

  const sealPlan = useCallback(async () => {
    setSealing(true);
    const side = direction === 'BUY' ? 'long' : 'short';
    const target = tp2 ?? tp1;
    const journals = apiMutate('/api/journal', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        symbol,
        side,
        openedAt: Date.now(),
        entry,
        stop,
        ...(target !== null ? { target } : {}),
        size: Number(sizeLots.toFixed(2)),
        notes: `Sealed from Syndicate Dossier ${planId}`,
        tags: ['council-seal'],
      }),
    });
    const stopAlert = apiMutate('/api/alerts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        rule: {
          type: 'priceCross',
          symbol,
          level: stop,
          direction: side === 'long' ? 'below' : 'above',
        },
        channels: ['email'],
        note: `${planId} Invalidation (SL)`,
      }),
    });
    const targetAlert =
      target === null
        ? null
        : apiMutate('/api/alerts', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({
              rule: {
                type: 'priceCross',
                symbol,
                level: target,
                direction: side === 'long' ? 'above' : 'below',
              },
              channels: ['email'],
              note: `${planId} Target`,
            }),
          });

    try {
      const results = await Promise.allSettled([
        journals,
        stopAlert,
        ...(targetAlert ? [targetAlert] : []),
      ]);

      if (results[0]?.status === 'rejected') {
        toast.error('Could not log the trade', {
          description:
            'The journal rejected the entry. Check /alerts before retrying to avoid duplicate protection.',
        });
        return;
      }

      const failedAlerts = results.slice(1).filter((r) => r.status === 'rejected').length;
      setSealed(true);

      if (failedAlerts > 0) {
        toast.warning(`Plan ${planId} logged, alerts incomplete`, {
          description: `${failedAlerts} of ${results.length - 1} protection alerts were not armed. Check /alerts.`,
        });
        return;
      }

      toast.success(`Plan ${planId} sealed`, {
        description: (
          <span className="flex items-center gap-2">
            <Link href="/journal" className="underline">
              Open journal
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/alerts" className="underline">
              View alerts
            </Link>
          </span>
        ),
      });
    } catch {
      toast.error('Could not seal the plan', {
        description:
          'The journal or alert service rejected one of the legs. Check /journal and /alerts before retrying.',
      });
    } finally {
      setSealing(false);
    }
  }, [direction, entry, planId, sizeLots, stop, symbol, tp1, tp2]);

  return { sealing, sealed, sealPlan };
}
