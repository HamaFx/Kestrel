// SPDX-License-Identifier: Apache-2.0

// Admin platform-config DTOs and form shape shared by the section cards.

export interface ProviderModelItem {
  modelId: string;
  label?: string;
  tier?: string;
  inputPerMTokUsd?: number | null;
  outputPerMTokUsd?: number | null;
}

export interface PlatformProviderDTO {
  id: string;
  displayName: string;
  hasKey: boolean;
  hasDbKey: boolean;
  updatedAt: string | null;
  health: {
    ok: boolean;
    error: string | null;
    testedAt: string;
  } | null;
  usage30d: {
    turns: number;
    costUsd: number;
  };
  models: ProviderModelItem[];
}

export interface ToolCatalogueEntry {
  name: string;
  description: string;
  invocations24h: number;
  failures24h: number;
  medianMs: number;
  p95Ms: number;
  disabled: boolean;
}

export interface PlatformConfigDTO {
  providers: PlatformProviderDTO[];
  routing: {
    chatModel: string | null;
    visionModel: string | null;
    embeddingModel: string | null;
    aiFallbackChain: string[];
    defaultAnalysisMode: 'single' | 'full';
    showAgentOpinions: boolean;
    agentModelOverrides: Record<string, string>;
    customInstructions: string;
  };
  marketData: {
    marketDataProvider: 'biquote' | 'finnhub' | 'live-ticks';
    finnhubKeySet: boolean;
  };
  tools: {
    catalogue: ToolCatalogueEntry[];
    disabledTools: string[];
    allTools: string[];
  };
  budget: {
    monthlyBudgetLimit: number | null;
    maxDailyUsd: number | null;
    todayTurns: number;
    todayUsd: number;
    thirtyDayTurns: number;
    thirtyDayUsd: number;
  };
}

export interface PlatformConfigForm {
  chatModel: string;
  visionModel: string;
  embeddingModel: string;
  fallbackChain: string[];
  defaultMode: 'single' | 'full';
  showOpinions: boolean;
  deskOverrides: Record<string, string>;
  customInstructions: string;
  marketProvider: 'biquote' | 'finnhub' | 'live-ticks';
  maxDailyUsd: string;
  monthlyBudgetLimit: string;
  disabledTools: string[];
}

export interface PlatformConfigUi {
  keyDrafts: Record<string, string>;
  busyProvider: string | null;
  bulkTesting: boolean;
  savingRouting: boolean;
  savingMarket: boolean;
  savingBudget: boolean;
  savingTools: boolean;
  testingMarket: boolean;
  marketTestResult: { ok: boolean; message: string } | null;
}

export const SPECIALIST_DESKS: Array<{
  key: 'technical' | 'fundamental' | 'sentiment' | 'risk' | 'decision';
  label: string;
  description: string;
}> = [
  {
    key: 'technical',
    label: 'Technical Desk',
    description: 'Price action, structure, support/resistance, and indicators',
  },
  {
    key: 'fundamental',
    label: 'Macro & Fundamental Desk',
    description: 'Central banks, economic calendar, yields, and COT positioning',
  },
  {
    key: 'sentiment',
    label: 'Sentiment Desk',
    description: 'News flow, crowd positioning, and session bias',
  },
  {
    key: 'risk',
    label: 'Risk & Guardrails Desk',
    description: 'Invalidation zones, position sizing, and event risk checks',
  },
  {
    key: 'decision',
    label: 'Decision Synthesis',
    description: 'Final trade plan synthesis across all 4 specialist desks',
  },
];

export const EMPTY_FORM: PlatformConfigForm = {
  chatModel: '',
  visionModel: '',
  embeddingModel: '',
  fallbackChain: [],
  defaultMode: 'single',
  showOpinions: true,
  deskOverrides: {},
  customInstructions: '',
  marketProvider: 'biquote',
  maxDailyUsd: '',
  monthlyBudgetLimit: '',
  disabledTools: [],
};

export const EMPTY_UI: PlatformConfigUi = {
  keyDrafts: {},
  busyProvider: null,
  bulkTesting: false,
  savingRouting: false,
  savingMarket: false,
  savingBudget: false,
  savingTools: false,
  testingMarket: false,
  marketTestResult: null,
};
