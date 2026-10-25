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

// State + actions for the paper-order form.
//
// One reducer owns the twelve form fields plus the busy/error/message flags so
// the form shell stays a thin presentational component.

import { useReducer, type FormEvent } from 'react';
import type { z } from 'zod';

import type { AccountSchema } from '../../schemas';
import { errorMessage, pluginFetch } from '../api';

export type Account = z.infer<typeof AccountSchema>;
export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type TimeInForce = 'gtc' | 'day';

export interface OrderFormValues {
  accountRef: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: string;
  riskPct: string;
  price: string;
  stopLoss: string;
  takeProfit: string;
  trailingStop: string;
  timeInForce: TimeInForce;
  notes: string;
}

export interface OrderFormState extends OrderFormValues {
  busy: boolean;
  error: string | null;
  message: string | null;
}

type OrderFormAction =
  | { type: 'patch'; patch: Partial<OrderFormValues> }
  | { type: 'submit-start' }
  | { type: 'submit-success'; message: string }
  | { type: 'submit-error'; error: string };

const initialState: OrderFormState = {
  accountRef: 'personal',
  symbol: 'XAUUSD',
  side: 'buy',
  type: 'market',
  quantity: '',
  riskPct: '',
  price: '',
  stopLoss: '',
  takeProfit: '',
  trailingStop: '',
  timeInForce: 'gtc',
  notes: '',
  busy: false,
  error: null,
  message: null,
};

function orderFormReducer(state: OrderFormState, action: OrderFormAction): OrderFormState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'submit-start':
      return { ...state, busy: true, error: null, message: null };
    case 'submit-success':
      return {
        ...state,
        busy: false,
        message: action.message,
        quantity: '',
        riskPct: '',
        price: '',
        stopLoss: '',
        takeProfit: '',
        trailingStop: '',
        notes: '',
      };
    case 'submit-error':
      return { ...state, busy: false, error: action.error };
  }
}

export function usePlaceOrder({
  accounts,
  onPlaced,
}: {
  accounts: readonly Account[];
  onPlaced: () => void;
}) {
  const [state, dispatch] = useReducer(orderFormReducer, initialState);

  const selected = accounts.find(
    (account) => account.id === state.accountRef || account.mode === state.accountRef,
  );

  function setField(patch: Partial<OrderFormValues>) {
    dispatch({ type: 'patch', patch });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    dispatch({ type: 'submit-start' });
    try {
      const response = await pluginFetch<{ ok: boolean; message: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          account: state.accountRef,
          symbol: state.symbol,
          side: state.side,
          type: state.type,
          ...(state.quantity ? { quantity: Number(state.quantity) } : {}),
          ...(state.riskPct ? { riskPct: Number(state.riskPct) } : {}),
          ...(state.type !== 'market' && state.price ? { price: Number(state.price) } : {}),
          ...(state.stopLoss ? { stopLoss: Number(state.stopLoss) } : {}),
          ...(state.takeProfit ? { takeProfit: Number(state.takeProfit) } : {}),
          ...(state.trailingStop ? { trailingStop: Number(state.trailingStop) } : {}),
          timeInForce: state.timeInForce,
          ...(state.notes.trim() ? { notes: state.notes.trim() } : {}),
        }),
      });
      dispatch({ type: 'submit-success', message: response.message });
      onPlaced();
    } catch (err) {
      dispatch({ type: 'submit-error', error: errorMessage(err) });
    }
  }

  return { state, selected, setField, submit };
}
