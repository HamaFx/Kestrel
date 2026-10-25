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

// The TickBus is on the hot path for core tick ingestion. These tests lock
// in the two invariants that matter: a throwing plugin cannot break publish()
// or other subscribers, and symbol filters are honoured.

import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/log';
import { TickBus } from '../src/tick-bus';

const log = createLogger({ service: 'test:tick-bus', forceJson: true });

function tick(symbol: string) {
  return { symbol, bid: 1, ask: 2, mid: 1.5, ts: Date.now(), source: 'test' };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('TickBus', () => {
  it('isolates subscriber failures and respects symbol filters', async () => {
    const received: string[] = [];
    const bus = new TickBus({
      log,
      subscribers: [
        {
          pluginId: 'alpha',
          id: 'xau-only',
          symbols: ['XAUUSD'],
          handler: (value) => {
            received.push(value.symbol);
          },
        },
        {
          pluginId: 'beta',
          id: 'boom',
          handler: () => {
            throw new Error('plugin exploded');
          },
        },
        {
          pluginId: 'gamma',
          id: 'btc-only',
          symbols: ['BTCUSDT'],
          handler: (value) => {
            received.push(`btc:${value.symbol}`);
          },
        },
      ],
    });

    expect(() => bus.publish(tick('XAUUSD'))).not.toThrow();
    await flush();

    expect(received).toEqual(['XAUUSD']);
    expect(bus.getStats()).toMatchObject({ published: 1, delivered: 1, failed: 1, dropped: 0 });

    bus.publish(tick('BTCUSDT'));
    await flush();
    expect(received).toEqual(['XAUUSD', 'btc:BTCUSDT']);

    bus.stop();
    bus.publish(tick('XAUUSD'));
    await flush();
    expect(received).toHaveLength(2);
  });
});
