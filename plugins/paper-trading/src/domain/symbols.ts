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

// Pure paper-broker domain — symbol and side helpers.

import { pipSize, tryGetSymbolDefinition } from '@kestrel/shared';

import type { OrderSide, PositionSide } from './types';

export function contractSizeFor(symbol: string): number {
  return tryGetSymbolDefinition(symbol)?.capabilities.contractSize ?? 1;
}

export function pipSizeFor(symbol: string): number {
  return pipSize(symbol);
}

export function sideToPosition(side: OrderSide): PositionSide {
  return side === 'buy' ? 'long' : 'short';
}

export function positionToExitSide(side: PositionSide): OrderSide {
  return side === 'long' ? 'sell' : 'buy';
}
