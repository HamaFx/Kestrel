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

import type { XauusdResearchReport } from './report/report-types';
import type { XauusdResearchPacket } from '../../packets/research-types';
import { extractNarrativeNumbers } from './report/report-grounding';

/**
 * Market-context terms. A number only counts as a market claim when it sits
 * near one of these terms (P1-11 adds the order-intent verbs enter/buy/sell/
 * exit/add/reduce so "I entered at 2,405" is guarded like any other market
 * figure even without a classic market noun).
 */
const MARKET_CONTEXT_CLAIM =
  /\b(?:xauusd|gold|price|support|resistance|invalidation|trigger|target|level|rsi|ema|atr|yield|dollar|enter|buy|sell|exit|add|reduce)\b[^.!?\n]{0,100}\b\d[\d,]*(?:\.\d+)?/gi;

/**
 * A follow-up is allowed to explain trusted context, but it must not invent a
 * new market number. Returning a deterministic fallback is safer than
 * allowing an unverified plain-text claim through the report verifier.
 *
 * P1-11 — numbers are tokenized with the shared narrative extractor
 * (`extractNarrativeNumbers`, comma-thousands aware, structural notation like
 * timeframes excluded) and compared as parsed values against a parsed set of
 * trusted numbers. The previous raw substring check let "240" through because
 * "2400" contains it, and split "1,234.5" into "1" and "234.5" — both matched
 * some digit sequence in the trusted JSON.
 */
export function guardXauusdFollowupText(
  text: string,
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
): string {
  const trustedContext = `${JSON.stringify(report)} ${JSON.stringify(packet)}`;
  const trustedNumbers = new Set(extractNarrativeNumbers(trustedContext));
  const claims = text.match(MARKET_CONTEXT_CLAIM) ?? [];
  const hasUntrustedClaim = claims.some((claim) =>
    extractNarrativeNumbers(claim).some((value) => !trustedNumbers.has(value)),
  );

  if (!hasUntrustedClaim) return text;
  return [
    'I can explain the saved XAUUSD report, but this follow-up introduced a new market number that is not supported by the trusted evidence.',
    'I stopped rather than repeat an unverified figure. Ask for a fresh XAUUSD analysis to refresh the market data.',
  ].join('\n\n');
}
