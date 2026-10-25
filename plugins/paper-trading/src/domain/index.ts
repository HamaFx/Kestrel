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

// Pure paper-broker domain — barrel for the split domain groups.
//
// No database, no network, no clock: every function takes the state it needs
// and returns a decision. The services in `src/services/` persist those
// decisions. This split lets the money math be unit-tested exhaustively.

export { ACCOUNT_MODES } from './types';
export type {
  AccountLike,
  AccountMode,
  AccountSnapshot,
  MarketTick,
  OrderMatch,
  OrderSide,
  OrderStatus,
  OrderType,
  PaperOrderState,
  PaperPositionState,
  PositionCloseReason,
  PositionEvaluation,
  PositionForAccount,
  PositionSide,
  PositionStatus,
  Quotes,
  SizingArgs,
  SizingResult,
} from './types';
export { contractSizeFor, pipSizeFor, positionToExitSide, sideToPosition } from './symbols';
export { accountSnapshot, entryFeeFor, grossPnl, positionMargin, sizePosition } from './math';
export { exitQuote, marketFillPrice, quotesFromTick } from './quotes';
export {
  evaluatePosition,
  matchOrder,
  outcomeFor,
  rMultipleFor,
  validateBracket,
} from './evaluation';
