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

// D-03 (audit 2026-10-18): one aggregate surface (`xauusdMastraTools`,
// `xauusdMastraConversationToolNames`) instead of per-tool re-export
// indirection. Consumers import each tool from its definition file
// (`./tools/price-tool`, …) — the redundant re-export block removed here had
// no consumers of its own.

import { manifestToolNames } from '../../capabilities';
import { xauusdResearchPacketTool } from '../../packets/research-packet-tool';
import {
  mastraCotTool,
  mastraKnowledgeTool,
  mastraResonanceTool,
  mastraSeasonalityTool,
  mastraWebSearchTool,
} from './read-only-tools';
import { xauusdCalendarTool } from './tools/calendar-tool';
import { xauusdCandlesTool } from './tools/candles-tool';
import { xauusdCorrelationTool } from './tools/correlation-tool';
import { xauusdFundamentalContextTool } from './tools/fundamental-context-tool';
import { xauusdIndicatorsTool } from './tools/indicators-tool';
import { xauusdIntermarketTool } from './tools/intermarket-tool';
import { xauusdMarketStructureTool } from './tools/market-structure-tool';
import { xauusdNewsTool } from './tools/news-tool';
import { xauusdPriceTool } from './tools/price-tool';
import { xauusdSessionLevelsTool } from './tools/session-levels-tool';
import { xauusdSocialSentimentTool } from './tools/social-sentiment-tool';
import { xauusdTechnicalAnalysisTool } from './tools/technical-tool';
import { xauusdVolatilityTool } from './tools/volatility-tool';

export const xauusdMastraTools = {
  getXauusdResearchPacket: xauusdResearchPacketTool,
  getXauusdPrice: xauusdPriceTool,
  getXauusdCandles: xauusdCandlesTool,
  getXauusdIndicators: xauusdIndicatorsTool,
  getXauusdMarketStructure: xauusdMarketStructureTool,
  getXauusdSessionLevels: xauusdSessionLevelsTool,
  analyzeXauusdTechnical: xauusdTechnicalAnalysisTool,
  getXauusdCorrelation: xauusdCorrelationTool,
  getXauusdIntermarket: xauusdIntermarketTool,
  forecastXauusdVolatility: xauusdVolatilityTool,
  getXauusdNews: xauusdNewsTool,
  getXauusdCalendar: xauusdCalendarTool,
  getXauusdSocialSentiment: xauusdSocialSentimentTool,
  getXauusdFundamentalContext: xauusdFundamentalContextTool,
  getXauusdSeasonality: mastraSeasonalityTool,
  getXauusdCot: mastraCotTool,
  getXauusdIntermarketResonance: mastraResonanceTool,
  searchUntrustedWeb: mastraWebSearchTool,
  searchUntrustedKnowledge: mastraKnowledgeTool,
};

const XAUUSD_CONVERSATION_TOOL_IDS = {
  'get-xauusd-market-structure': 'getXauusdMarketStructure',
  'get-xauusd-session-levels': 'getXauusdSessionLevels',
  'analyze-xauusd-technical': 'analyzeXauusdTechnical',
  'get-xauusd-correlation': 'getXauusdCorrelation',
  'get-xauusd-intermarket': 'getXauusdIntermarket',
  'forecast-xauusd-volatility': 'forecastXauusdVolatility',
  'get-xauusd-news': 'getXauusdNews',
  'get-xauusd-calendar': 'getXauusdCalendar',
  'get-xauusd-social-sentiment': 'getXauusdSocialSentiment',
  'get-xauusd-fundamental-context': 'getXauusdFundamentalContext',
  'get-xauusd-seasonality': 'getXauusdSeasonality',
  'get-xauusd-cot': 'getXauusdCot',
  'get-xauusd-intermarket-resonance': 'getXauusdIntermarketResonance',
  'search-untrusted-web': 'searchUntrustedWeb',
  'search-untrusted-knowledge': 'searchUntrustedKnowledge',
} as const;

export const xauusdMastraConversationToolNames = manifestToolNames('xauusd-conversation').map(
  (toolName) => XAUUSD_CONVERSATION_TOOL_IDS[toolName as keyof typeof XAUUSD_CONVERSATION_TOOL_IDS],
);
