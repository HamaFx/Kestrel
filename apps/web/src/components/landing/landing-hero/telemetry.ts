// SPDX-License-Identifier: Apache-2.0

// Static telemetry data for the landing hero: the switchable live market &
// trade setup summary previews and the market-pulse ticker items.

export type DeskBias = 'BULL' | 'BEAR' | 'GUARD';

interface SymbolTelemetry {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  spread: string;
  sessionLabel: string;
  supportLevel: string;
  supportNote: string;
  resistanceLevel: string;
  resistanceNote: string;
  atrNote: string;
  direction: 'BUY / LONG' | 'SELL / SHORT';
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  rr: string;
  riskSize: string;
  conviction: number;
  techSignal: string;
  macroSignal: string;
  riskSignal: string;
  sentimentSignal: string;
  techBias: DeskBias;
  macroBias: DeskBias;
  riskBias: DeskBias;
  sentimentBias: DeskBias;
}

export const SYMBOLS: SymbolTelemetry[] = [
  {
    symbol: 'XAU/USD',
    name: 'Spot Gold / US Dollar',
    price: '2,864.20',
    change: '+1.42% (+9.80)',
    isPositive: true,
    spread: '0.12 pts',
    sessionLabel: 'London / NY Overlap · 4H Structure',
    supportLevel: '2,846.50',
    supportNote: '4H Demand + EMA 50',
    resistanceLevel: '2,884.00',
    resistanceNote: 'Prior Weekly High',
    atrNote: 'ATR(14): 11.80 pts',
    direction: 'BUY / LONG',
    entry: '2,864.00',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,916.50',
    rr: '1:3.2',
    riskSize: '0.85% Equity',
    conviction: 91,
    macroSignal: 'US 10Y yields -4.2 bps (4.28%) · DXY softening',
    techSignal: 'Higher low held at 2,860 · EMA20 > EMA50 on 4H',
    riskSignal: '0.85% risk within 1.0% cap · 17.5 pt stop',
    sentimentSignal: 'CFTC Commercials net long +18,420 contracts',
    techBias: 'BULL',
    macroBias: 'BULL',
    riskBias: 'GUARD',
    sentimentBias: 'BULL',
  },
  {
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    price: '1.0845',
    change: '+0.28% (+0.0030)',
    isPositive: true,
    spread: '0.4 pips',
    sessionLabel: 'London Session · 4H Structure',
    supportLevel: '1.0812',
    supportNote: 'Asian Session Low',
    resistanceLevel: '1.0895',
    resistanceNote: 'Weekly Supply Zone',
    atrNote: 'ATR(14): 19.0 pips',
    direction: 'BUY / LONG',
    entry: '1.0840',
    invalidation: '1.0812',
    target1: '1.0895',
    target2: '1.0930',
    rr: '1:3.1',
    riskSize: '0.75% Equity',
    conviction: 87,
    macroSignal: 'ECB rate hold priced · Bund-Treasury spread narrowing',
    techSignal: '4H swing low reclaimed above 1.0830 pivot',
    riskSignal: '0.75% risk within 1.0% cap · 28 pip stop',
    sentimentSignal: 'Asset managers net long +12,100 contracts',
    techBias: 'BULL',
    macroBias: 'GUARD',
    riskBias: 'GUARD',
    sentimentBias: 'BULL',
  },
  {
    symbol: 'GBP/USD',
    name: 'British Pound / US Dollar',
    price: '1.2912',
    change: '-0.15% (-0.0019)',
    isPositive: false,
    spread: '0.6 pips',
    sessionLabel: 'London Session · 4H Structure',
    supportLevel: '1.2850',
    supportNote: 'Daily EMA 50 Support',
    resistanceLevel: '1.2950',
    resistanceNote: 'Previous Day High',
    atrNote: 'ATR(14): 24.0 pips',
    direction: 'SELL / SHORT',
    entry: '1.2915',
    invalidation: '1.2950',
    target1: '1.2850',
    target2: '1.2805',
    rr: '1:3.0',
    riskSize: '0.80% Equity',
    conviction: 85,
    macroSignal: 'Dovish BoE rate path weighing on Gilt yields',
    techSignal: 'Previous-day high rejected at 1.2950 supply',
    riskSignal: '0.80% risk within 1.0% cap · 35 pip stop',
    sentimentSignal: 'Leveraged funds trimming long exposure',
    techBias: 'BEAR',
    macroBias: 'BEAR',
    riskBias: 'GUARD',
    sentimentBias: 'BEAR',
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
