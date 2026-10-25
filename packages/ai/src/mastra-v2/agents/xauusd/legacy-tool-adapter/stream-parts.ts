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

// Stream-part parsing for the canonical chat runner (DEC-05 split of
// legacy-tool-adapter.ts): the Mastra tool stream events, the UI tool-name
// mapping, and the AI SDK `tool-<name>` part extraction.

export type MastraToolStreamEvent =
  | {
      type: 'tool-input-start';
      toolCallId: string;
      toolName: string;
      providerExecuted?: boolean;
    }
  | {
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
    }
  | {
      type: 'tool-output-available';
      toolCallId: string;
      output: unknown;
    }
  | {
      type: 'tool-output-error';
      toolCallId: string;
      errorText: string;
    };

export interface MastraToolInvocationPart {
  type: `tool-${string}`;
  toolCallId: string;
  toolName: string;
  state: 'output-available' | 'output-error';
  input: unknown;
  output?: unknown;
  errorText?: string;
}

const XAUUSD_TO_UI_TOOL_NAME: Record<string, string> = {
  getXauusdPrice: 'get_price',
  'get-xauusd-price': 'get_price',
  getXauusdCandles: 'get_candles',
  'get-xauusd-candles': 'get_candles',
  getXauusdIndicators: 'get_indicators',
  'get-xauusd-indicators': 'get_indicators',
  getXauusdMarketStructure: 'get_market_structure',
  'get-xauusd-market-structure': 'get_market_structure',
  getXauusdSessionLevels: 'get_session_levels',
  'get-xauusd-session-levels': 'get_session_levels',
  analyzeXauusdTechnical: 'analyze_technical',
  'analyze-xauusd-technical': 'analyze_technical',
  getXauusdCorrelation: 'get_correlation',
  'get-xauusd-correlation': 'get_correlation',
  getXauusdIntermarket: 'get_intermarket',
  'get-xauusd-intermarket': 'get_intermarket',
  forecastXauusdVolatility: 'forecast_volatility',
  'forecast-xauusd-volatility': 'forecast_volatility',
  getXauusdNews: 'get_news',
  'get-xauusd-news': 'get_news',
  getXauusdCalendar: 'get_calendar',
  'get-xauusd-calendar': 'get_calendar',
  getXauusdSocialSentiment: 'get_social_sentiment',
  'get-xauusd-social-sentiment': 'get_social_sentiment',
  getXauusdFundamentalContext: 'analyze_fundamental',
  'get-xauusd-fundamental-context': 'analyze_fundamental',
  getXauusdSeasonality: 'get_seasonality',
  'get-xauusd-seasonality': 'get_seasonality',
  getXauusdCot: 'get_cot',
  'get-xauusd-cot': 'get_cot',
  getXauusdIntermarketResonance: 'get_intermarket_resonance',
  'get-xauusd-intermarket-resonance': 'get_intermarket_resonance',
  searchUntrustedWeb: 'web_search',
  'search-untrusted-web': 'web_search',
  searchUntrustedKnowledge: 'search_knowledge',
  'search-untrusted-knowledge': 'search_knowledge',
};

export function normalizeUiToolName(rawName: string): string {
  const stripped = rawName.startsWith('kestrel-') ? rawName.slice('kestrel-'.length) : rawName;
  return XAUUSD_TO_UI_TOOL_NAME[stripped] ?? stripped;
}

/**
 * Extract structured AI SDK v5 `tool-<name>` UI parts from Mastra response
 * messages, merging with any parts already captured live via `adaptLegacyReadOnlyTool`.
 */
export function extractToolPartsFromMessages(
  messages: readonly unknown[] | undefined,
  existingParts: readonly MastraToolInvocationPart[] = [],
): MastraToolInvocationPart[] {
  const byCallId = new Map<string, MastraToolInvocationPart>();
  for (const part of existingParts) {
    byCallId.set(part.toolCallId, part);
  }
  if (!messages) return [...byCallId.values()];

  const inputsByCallId = new Map<string, { toolName: string; input: unknown }>();
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const candidate = part as {
        type?: unknown;
        toolCallId?: unknown;
        toolName?: unknown;
        args?: unknown;
        input?: unknown;
      };
      if (candidate.type === 'tool-call' && typeof candidate.toolName === 'string') {
        const uiName = normalizeUiToolName(candidate.toolName);
        const callId =
          typeof candidate.toolCallId === 'string' && candidate.toolCallId.length > 0
            ? candidate.toolCallId
            : `call-${uiName}`;
        inputsByCallId.set(callId, {
          toolName: uiName,
          input: candidate.input ?? candidate.args ?? {},
        });
      }
    }
  }

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const candidate = part as {
        type?: unknown;
        toolCallId?: unknown;
        toolName?: unknown;
        output?: unknown;
        result?: unknown;
      };
      if (candidate.type !== 'tool-result' || typeof candidate.toolName !== 'string') continue;
      const uiName = normalizeUiToolName(candidate.toolName);
      const callId =
        typeof candidate.toolCallId === 'string' && candidate.toolCallId.length > 0
          ? candidate.toolCallId
          : `call-${uiName}`;
      if (byCallId.has(callId)) continue;
      const inputEntry = inputsByCallId.get(callId);
      const output = candidate.output ?? candidate.result ?? null;
      byCallId.set(callId, {
        type: `tool-${uiName}`,
        toolCallId: callId,
        toolName: uiName,
        state: 'output-available',
        input: inputEntry?.input ?? {},
        output,
      });
    }
  }

  return [...byCallId.values()];
}
