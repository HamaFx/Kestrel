// SPDX-License-Identifier: Apache-2.0

// Static specs for the four security & self-hosted architecture layers of the
// landing architecture workbench.
import { IconBolt, IconDatabase, IconKey, IconShieldLock } from '@tabler/icons-react';
import type { ComponentType } from 'react';

export interface LayerSpec {
  id: 'execution' | 'risk' | 'deliberation' | 'ingestion';
  num: string;
  tag: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  securityBadge: string;
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
    title: 'PostgreSQL RLS & Multi-Channel Alerts',
    shortDesc: 'Row-level tenant isolation, TOTP 2FA, trade journal, and instant alerts.',
    fullDesc:
      'Every workspace is isolated at the PostgreSQL 16 engine level with Row-Level Security (RLS) and TOTP 2FA.',
    securityBadge: 'POSTGRESQL RLS · TOTP 2FA · NON-CUSTODIAL',
    accentColor: 'text-bull',
    borderColor: 'border-bull/50',
    glowColor: 'rgba(63, 158, 61, 0.4)',
    icon: IconShieldLock,
    telemetry: [
      { label: 'TENANT ISOLATION', value: 'PostgreSQL 16 RLS' },
      { label: 'AUTHENTICATION', value: 'Auth.js v5 + TOTP 2FA' },
      { label: 'ALERT CHANNELS', value: 'Telegram · Push · Email' },
      { label: 'CUSTODY MODEL', value: '100% Non-Custodial' },
    ],
  },
  {
    id: 'risk',
    num: '03',
    tag: 'ENCRYPTED BYOK VAULT',
    title: 'AES-256-GCM Keys & Spend Ledger',
    shortDesc: 'AES-256-GCM key encryption with integer-cent daily and monthly spend caps.',
    fullDesc:
      'Bring your own OpenAI, Anthropic, Google, or OpenRouter keys encrypted at rest with atomic spend caps.',
    securityBadge: 'AES-256-GCM VAULT · ATOMIC SPEND LEDGER',
    accentColor: 'text-warn',
    borderColor: 'border-warn/50',
    glowColor: 'rgba(235, 140, 31, 0.4)',
    icon: IconKey,
    telemetry: [
      { label: 'KEY ENCRYPTION', value: 'AES-256-GCM Vault' },
      { label: 'PROVIDERS', value: 'OpenAI · Anthropic · Gemini' },
      { label: 'SPEND GUARD', value: 'Integer-Cent Budget Caps' },
      { label: 'RISK CEILING', value: '≤ 1.0% Equity Cap' },
    ],
  },
  {
    id: 'deliberation',
    num: '02',
    tag: '4-DESK RESEARCH ENGINE',
    title: 'Parallel 4-Desk Engine & Hybrid RAG',
    shortDesc: 'Four independent research desks verified against live market math.',
    fullDesc:
      'Runs four domain-isolated AI desks in parallel with pgvector + FTS recall and deterministic R:R verification.',
    securityBadge: '4/4 NUMERIC VERIFIER · HYBRID RAG',
    accentColor: 'text-brand',
    borderColor: 'border-brand/50',
    glowColor: 'rgba(255, 54, 22, 0.45)',
    icon: IconBolt,
    telemetry: [
      { label: 'SPECIALIST DESKS', value: 'Macro · Tech · Risk · COT' },
      { label: 'ROUTING', value: 'Fast Scout or Full Council' },
      { label: 'MATH CHECK', value: '4/4 Numeric Verifier' },
      { label: 'MEMORY ENGINE', value: 'pgvector + FTS Recall' },
    ],
  },
  {
    id: 'ingestion',
    num: '01',
    tag: 'MULTI-PROVIDER MARKET DATA',
    title: 'Health-Scored Feeds & SWR Cache',
    shortDesc: 'Live Gold, Forex, Crypto, and Macro feeds with automatic failover.',
    fullDesc:
      'Aggregates ticks, OHLCV candles, yields, and CFTC COT reports across six adapters with automatic failover.',
    securityBadge: 'HEALTH-SCORED FAILOVER · SWR CACHE',
    accentColor: 'text-info',
    borderColor: 'border-info/50',
    glowColor: 'rgba(38, 126, 224, 0.4)',
    icon: IconDatabase,
    telemetry: [
      { label: 'COVERAGE', value: 'XAU/USD · 11 FX · 6 Crypto' },
      { label: 'ADAPTERS', value: 'BiQuote · Binance · FRED' },
      { label: 'RELIABILITY', value: 'Health-Scored Failover' },
      { label: 'INDICATORS', value: 'EMA · RSI · ATR · Pivots' },
    ],
  },
];
