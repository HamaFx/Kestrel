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

import { xauusdCalendarTool } from '../../../mastra/calendar-tool';
import { xauusdCandlesTool } from '../../../mastra/candles-tool';
import { manifestToolNames } from '../../../mastra/capabilities';
import { xauusdCorrelationTool } from '../../../mastra/correlation-tool';
import { xauusdFundamentalContextTool } from '../../../mastra/fundamental-context-tool';
import { xauusdIndicatorsTool } from '../../../mastra/indicators-tool';
import { xauusdIntermarketTool } from '../../../mastra/intermarket-tool';
import { xauusdMarketStructureTool } from '../../../mastra/market-structure-tool';
import { xauusdNewsTool } from '../../../mastra/news-tool';
import { xauusdPriceTool } from '../../../mastra/price-tool';
import {
  mastraCotTool,
  mastraKnowledgeTool,
  mastraResonanceTool,
  mastraSeasonalityTool,
  mastraWebSearchTool,
} from '../../../mastra/read-only-tools';
import { xauusdResearchPacketTool } from '../../../mastra/research-packet-tool';
import { xauusdSessionLevelsTool } from '../../../mastra/session-levels-tool';
import { xauusdSocialSentimentTool } from '../../../mastra/social-sentiment-tool';
import { xauusdTechnicalAnalysisTool } from '../../../mastra/technical-tool';
import { xauusdVolatilityTool } from '../../../mastra/volatility-tool';

export { xauusdCalendarTool } from '../../../mastra/calendar-tool';
export { xauusdResearchPacketTool } from '../../../mastra/research-packet-tool';
export { xauusdPriceTool } from '../../../mastra/price-tool';
export { xauusdCandlesTool } from '../../../mastra/candles-tool';
export { xauusdFundamentalContextTool } from '../../../mastra/fundamental-context-tool';
export { xauusdIndicatorsTool } from '../../../mastra/indicators-tool';
export { xauusdMarketStructureTool } from '../../../mastra/market-structure-tool';
export { xauusdSessionLevelsTool } from '../../../mastra/session-levels-tool';
export { xauusdTechnicalAnalysisTool } from '../../../mastra/technical-tool';
export { xauusdCorrelationTool } from '../../../mastra/correlation-tool';
export { xauusdIntermarketTool } from '../../../mastra/intermarket-tool';
export { xauusdVolatilityTool } from '../../../mastra/volatility-tool';
export { xauusdNewsTool } from '../../../mastra/news-tool';
export { xauusdSocialSentimentTool } from '../../../mastra/social-sentiment-tool';
export {
  mastraCotTool,
  mastraKnowledgeTool,
  mastraResonanceTool,
  mastraSeasonalityTool,
  mastraWebSearchTool,
} from '../../../mastra/read-only-tools';

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
