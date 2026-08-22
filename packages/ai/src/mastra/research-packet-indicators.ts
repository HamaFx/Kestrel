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

import { buildIndicatorsEvidence } from './evidence-builders';
import {
  RESEARCH_CANDLE_OUTPUT,
  RESEARCH_INDICATOR_OUTPUT,
  XAUUSD_RESEARCH_INDICATORS,
} from './research-config';
import type { CandleSuccess } from './research-packet-candles';
import {
  completeResearchStage,
  recordResearchStageFailure,
  startResearchStage,
  warningForResearchFailure,
} from './research-packet-stages';
import type { XauusdResearchPacket } from './research-types';
import { XAUUSD } from './types';

export function collectIndicatorEvidence(
  packetId: string,
  successes: readonly CandleSuccess[],
  warnings: string[],
  missingData: string[],
): XauusdResearchPacket['indicators'] {
  const indicators: XauusdResearchPacket['indicators'] = [];

  for (const { window, result } of successes) {
    const stage = `indicators.${window.timeframe}`;
    startResearchStage(stage, { packetId, symbol: XAUUSD, timeframe: window.timeframe });
    try {
      const evidence = buildIndicatorsEvidence(
        window.timeframe,
        window.candleCount,
        result.value,
        XAUUSD_RESEARCH_INDICATORS,
        RESEARCH_CANDLE_OUTPUT,
        RESEARCH_INDICATOR_OUTPUT,
      );
      indicators.push(evidence);
      warnings.push(...evidence.warnings);
      completeResearchStage(stage, 'completed', {
        packetId,
        timeframe: window.timeframe,
        indicatorCount: evidence.data.results.length,
      });
    } catch (error) {
      missingData.push(`${window.timeframe} indicator calculations are unavailable.`);
      warnings.push(warningForResearchFailure(`${window.timeframe} indicators`));
      recordResearchStageFailure(stage, error, { packetId, timeframe: window.timeframe });
    }
  }

  return indicators;
}
