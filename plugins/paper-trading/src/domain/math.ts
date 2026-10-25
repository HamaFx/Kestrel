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

// Pure paper-broker domain — sizing, fees and margin math.
//
// No database, no network, no clock: every function takes the state it needs
// and returns a decision. The services in `src/services/` persist those
// decisions. This split lets the money math be unit-tested exhaustively.

import { contractSizeFor } from './symbols';
import type {
  AccountLike,
  AccountSnapshot,
  PaperPositionState,
  PositionForAccount,
  PositionSide,
  SizingArgs,
  SizingResult,
} from './types';

export function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function entryFeeFor(quantity: number, commissionPerUnit: number): number {
  return round(Math.max(0, commissionPerUnit) * quantity, 6);
}

/** Gross P&L before fees. */
export function grossPnl(
  side: PositionSide,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  contractSize: number,
): number {
  const direction = side === 'long' ? 1 : -1;
  return (exitPrice - entryPrice) * direction * quantity * contractSize;
}

/** Notional exposure and margin required at a given price. */
export function positionMargin(
  position: Pick<PaperPositionState, 'quantity' | 'entryPrice'>,
  contractSize: number,
  leverage: number,
): number {
  const notional = position.quantity * position.entryPrice * contractSize;
  return notional / Math.max(1, leverage);
}

export function accountSnapshot(
  account: Pick<AccountLike, 'balance'>,
  positions: readonly PositionForAccount[],
  leverage: number,
): AccountSnapshot {
  const open = positions.filter((position) => position.status === 'open');
  const unrealizedPnl = round(
    open.reduce((sum, position) => sum + position.unrealizedPnl, 0),
    2,
  );
  const equity = round(account.balance + unrealizedPnl, 2);
  const marginUsed = round(
    open.reduce(
      (sum, position) => sum + positionMargin(position, contractSizeFor(position.symbol), leverage),
      0,
    ),
    2,
  );
  const freeMargin = round(equity - marginUsed, 2);
  const marginUtilisationPct = equity > 0 ? round((marginUsed / equity) * 100, 2) : 0;
  return {
    balance: round(account.balance, 2),
    equity,
    unrealizedPnl,
    marginUsed,
    freeMargin,
    marginUtilisationPct,
  };
}

/**
 * Position size from risk and/or margin constraints.
 *
 * When `requestedQuantity` is supplied it wins, but the resulting risk and
 * margin are still validated. Otherwise `stopLoss` + `riskPct` are required.
 */
export function sizePosition(args: SizingArgs): SizingResult {
  const leverage = Math.max(1, args.leverage);
  const entry = args.entryPrice;
  if (!(entry > 0) || !Number.isFinite(entry)) {
    return { ok: false, reason: 'Entry price must be positive.' };
  }
  if (args.equity <= 0) {
    return { ok: false, reason: 'Account equity is zero.' };
  }

  const marginCap = Math.max(0, args.freeMargin) * (args.maxMarginUtilisationPct / 100);
  const maxQtyByMargin = (marginCap * leverage) / (entry * args.contractSize);
  if (!(maxQtyByMargin > 0)) {
    return { ok: false, reason: 'No free margin is available for this order.' };
  }

  let quantity: number;
  let riskAmount: number;

  if (args.requestedQuantity !== null) {
    quantity = args.requestedQuantity;
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      return { ok: false, reason: 'Quantity must be positive.' };
    }
    if (quantity > maxQtyByMargin + 1e-9) {
      return {
        ok: false,
        reason: `Quantity ${round(quantity, 4)} exceeds the available margin (max ${round(
          maxQtyByMargin,
          4,
        )}).`,
      };
    }
    if (args.stopLoss !== null) {
      const stopDistance = Math.abs(entry - args.stopLoss);
      riskAmount = stopDistance * quantity * args.contractSize;
      const maxRisk = (args.equity * args.maxRiskPct) / 100;
      if (riskAmount > maxRisk + 0.01) {
        return {
          ok: false,
          reason: `Risk ${round(riskAmount, 2)} exceeds the ${args.maxRiskPct}% cap (${round(
            maxRisk,
            2,
          )}). Reduce quantity or tighten the stop.`,
        };
      }
    } else {
      riskAmount = 0;
    }
  } else {
    if (args.stopLoss === null) {
      return {
        ok: false,
        reason: 'A stop loss is required when sizing from risk percentage.',
      };
    }
    const stopDistance = Math.abs(entry - args.stopLoss);
    if (!(stopDistance > 0)) {
      return { ok: false, reason: 'Stop loss must differ from the entry price.' };
    }
    const riskPct = args.riskPct ?? 1;
    if (!(riskPct > 0) || riskPct > args.maxRiskPct + 0.0001) {
      return {
        ok: false,
        reason: `Risk per trade must be between 0.01% and ${args.maxRiskPct}%.`,
      };
    }
    const riskBudget = (args.equity * riskPct) / 100;
    quantity = riskBudget / (stopDistance * args.contractSize);
    riskAmount = riskBudget;
  }

  quantity = Math.min(quantity, maxQtyByMargin);
  if (!(quantity > 0) || !Number.isFinite(quantity)) {
    return { ok: false, reason: 'Position size is below the minimum.' };
  }

  const notional = quantity * entry * args.contractSize;
  const margin = notional / leverage;
  if (margin > marginCap + 0.01) {
    return {
      ok: false,
      reason: `Margin ${round(margin, 2)} exceeds the ${args.maxMarginUtilisationPct}% utilisation cap.`,
    };
  }

  return {
    ok: true,
    quantity: round(quantity, 6),
    riskAmount: round(riskAmount, 2),
    notional: round(notional, 2),
    margin: round(margin, 2),
  };
}
