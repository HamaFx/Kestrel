// SPDX-License-Identifier: Apache-2.0

// Static specs for the four security & self-hosted architecture layers of the
// landing architecture workbench.
import { IconBolt, IconDatabase, IconKey, IconShieldLock } from '@tabler/icons-react';
import type { ComponentType } from 'react';

export interface LayerSpec {
  id: string;
  num: string;
  tag: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  securityBadge: string;
  highlights: string[];
  accentColor: string;
  borderColor: string;
  glowColor: string;
  icon: ComponentType<{ className?: string }>;
  telemetry: { label: string; value: string }[];
}

export const LAYERS: LayerSpec[] = [
  {
    id: 'execution',
    num: '04',
    tag: 'PRIVATE WORKSPACE & ALERTS',
    title: 'Private Workspace & Multi-Channel Alerts',
    shortDesc: 'Row-level tenant isolation, TOTP 2FA, trade journal, and instant alerts.',
    fullDesc:
      'Every user account is isolated at the PostgreSQL database level with Row-Level Security (RLS) and protected by TOTP 2FA. Save verified plans to your private Trade Journal and receive instant price alerts via Telegram, Browser Push, or Email.',
    securityBadge: 'POSTGRESQL RLS · TOTP 2FA · NON-CUSTODIAL',
    highlights: [
      'PostgreSQL 16 Row-Level Security (RLS) enforces strict per-user tenant isolation',
      'Optional 1-click plugins for Paper Trading, QuickJS WASM Backtesting, and Telegram Bot',
    ],
    accentColor: 'text-bull',
    borderColor: 'border-bull/50',
    glowColor: 'rgba(63, 158, 61, 0.4)',
    icon: IconShieldLock,
    telemetry: [
      { label: 'TENANT ISOLATION', value: 'PostgreSQL 16 Row-Level Security' },
      { label: 'AUTHENTICATION', value: 'Auth.js v5 + TOTP 2FA' },
      { label: 'ALERT CHANNELS', value: 'Telegram · Web Push · Email' },
      { label: 'CUSTODY MODEL', value: '100% Non-Custodial Copilot' },
    ],
  },
  {
    id: 'risk',
    num: '03',
    tag: 'ENCRYPTED BYOK VAULT',
    title: 'Encrypted API Keys & Spend Guardrails',
    shortDesc: 'AES-256-GCM key encryption with integer-cent daily and monthly spend caps.',
    fullDesc:
      'Bring your own API keys for OpenAI, Anthropic, Google Gemini, or OpenRouter. Keys are encrypted at rest with AES-256-GCM and paired with an atomic budget ledger that enforces daily and monthly spend limits before any AI request is sent.',
    securityBadge: 'AES-256-GCM VAULT · ATOMIC SPEND LEDGER',
    highlights: [
      'Keys are decrypted only in memory for outbound provider requests and never logged',
      'Integer-cent budget reservations block unexpected API spend spikes automatically',
    ],
    accentColor: 'text-warn',
    borderColor: 'border-warn/50',
    glowColor: 'rgba(235, 140, 31, 0.4)',
    icon: IconKey,
    telemetry: [
      { label: 'KEY ENCRYPTION', value: 'AES-256-GCM Authenticated Vault' },
      { label: 'SUPPORTED PROVIDERS', value: 'OpenAI · Anthropic · Google · OpenRouter' },
      { label: 'SPEND PROTECTION', value: 'Daily & Monthly Integer-Cent Caps' },
      { label: 'RISK CEILING', value: '≤ 1.0% Account Risk Guardrail' },
    ],
  },
  {
    id: 'deliberation',
    num: '02',
    tag: '4-ANGLE RESEARCH ENGINE',
    title: 'Parallel 4-Angle Analysis & Numeric Verifier',
    shortDesc: 'Four independent research angles checked against live market prices.',
    fullDesc:
      'Evaluates Economy & News, Chart & Price Levels, Risk & Trade Sizing, and Positioning & Sentiment in parallel, then runs a deterministic numeric verifier to confirm entry, stop-loss, and reward-to-risk math.',
    securityBadge: '4/4 NUMERIC VERIFIER · HYBRID RAG',
    highlights: [
      'Deterministic math check verifies stop distance and R:R ratios before display',
      'Hybrid pgvector + full-text search recalls your past journal notes and market context',
    ],
    accentColor: 'text-brand',
    borderColor: 'border-brand/50',
    glowColor: 'rgba(255, 54, 22, 0.45)',
    icon: IconBolt,
    telemetry: [
      { label: 'ANALYSIS ANGLES', value: 'Economy · Chart · Risk · Positioning' },
      { label: 'MODES AVAILABLE', value: 'Quick Question or Full 4-Angle Run' },
      { label: 'MATH VERIFICATION', value: 'Deterministic R:R & Stop Check' },
      { label: 'MEMORY ENGINE', value: 'Hybrid pgvector + FTS Recall' },
    ],
  },
  {
    id: 'ingestion',
    num: '01',
    tag: 'MULTI-PROVIDER MARKET DATA',
    title: 'Multi-Provider Market Data & Failover',
    shortDesc: 'Live Gold, Forex, Crypto, and Macro feeds with automatic health-scored failover.',
    fullDesc:
      'Aggregates real-time prices, OHLCV candles, Treasury yields, CFTC COT reports, and financial news across BiQuote, Binance, Finnhub, FRED, CFTC, and Marketaux with rolling health scores and L1/L2 stale-while-revalidate caching.',
    securityBadge: 'HEALTH-SCORED FAILOVER · SWR CACHE',
    highlights: [
      'Automatic provider failover keeps charts and briefings online if an upstream feed lags',
      'Freshness metadata tags every price and candle read so stale data is never hidden',
    ],
    accentColor: 'text-info',
    borderColor: 'border-info/50',
    glowColor: 'rgba(38, 126, 224, 0.4)',
    icon: IconDatabase,
    telemetry: [
      { label: 'ASSET COVERAGE', value: 'XAU/USD · 11 Forex · 6 Crypto' },
      { label: 'DATA ADAPTERS', value: 'BiQuote · Binance · Finnhub · FRED · CFTC' },
      { label: 'RELIABILITY', value: 'Rolling Health-Scored Failover' },
      { label: 'INDICATOR ENGINE', value: 'EMA · RSI · MACD · ATR · Bollinger' },
    ],
  },
];
