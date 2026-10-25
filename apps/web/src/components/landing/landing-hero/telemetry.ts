// SPDX-License-Identifier: Apache-2.0

// Static telemetry data for the landing hero: the switchable committee
// briefings and the live market-pulse ticker items.

interface SymbolTelemetry {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  spread: string;
  direction: 'BUY / LONG' | 'SELL / SHORT';
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  rr: string;
  conviction: number;
  techSignal: string;
  macroSignal: string;
  riskSignal: string;
  sentimentSignal: string;
}

export const SYMBOLS: SymbolTelemetry[] = [
  {
    symbol: 'XAU/USD',
    name: 'Spot Gold / US Dollar',
    price: '2,864.20',
    change: '+1.42% (+9.80)',
    isPositive: true,
    spread: '0.12 pts',
    direction: 'BUY / LONG',
    entry: '2,864.00',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,916.50',
    rr: '1:3.2',
    conviction: 91,
    techSignal: 'FVG +94%',
    macroSignal: 'Yields -4bp',
    riskSignal: '1% @ 2,846',
    sentimentSignal: 'Whales Long',
  },
  {
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    price: '1.0845',
    change: '+0.28% (+0.0030)',
    isPositive: true,
    spread: '0.4 pips',
    direction: 'BUY / LONG',
    entry: '1.0840',
    invalidation: '1.0812',
    target1: '1.0895',
    target2: '1.0930',
    rr: '1:3.1',
    conviction: 87,
    techSignal: 'Sweep +88%',
    macroSignal: 'ECB Hold',
    riskSignal: '0.8% SL',
    sentimentSignal: 'COT Bullish',
  },
  {
    symbol: 'GBP/USD',
    name: 'British Pound / US Dollar',
    price: '1.2912',
    change: '-0.15% (-0.0019)',
    isPositive: false,
    spread: '0.6 pips',
    direction: 'SELL / SHORT',
    entry: '1.2915',
    invalidation: '1.2950',
    target1: '1.2850',
    target2: '1.2805',
    rr: '1:3.0',
    conviction: 85,
    techSignal: 'Supply +85%',
    macroSignal: 'BoE Doves',
    riskSignal: '1% @ 1.295',
    sentimentSignal: 'Funds Short',
  },
];

export const TICKER_ITEMS = [
  { symbol: 'XAU/USD', price: '$2,864.20', change: '+1.42%', up: true },
  { symbol: 'EUR/USD', price: '1.0845', change: '+0.28%', up: true },
  { symbol: 'GBP/USD', price: '1.2912', change: '-0.15%', up: false },
  { symbol: 'USD/JPY', price: '153.80', change: '-0.45%', up: false },
  { symbol: 'DXY', price: '104.12', change: '-0.34%', up: false },
  { symbol: 'US10Y', price: '4.28%', change: '-4.2bp', up: false },
];
