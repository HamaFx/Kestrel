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

// M-02 — assemble the generic macro extension for non-XAUUSD symbols.

import { tryGetSymbolDefinition, type Symbol } from '@kestrel/shared';

import { createEvidenceId } from '../evidence';
import { quarantineExternalText } from '../external-content';
import type { GenericMacroFetchResult } from './fetch';
import {
  EXTERNAL_TITLE_MAX_LENGTH,
  GENERIC_MACRO_COT_WEEKS,
  GENERIC_MACRO_EVENT_LIMIT,
  GENERIC_MACRO_NEWS_LIMIT,
} from './limits';
import { GenericMacroExtensionSchema, type GenericMacroExtension } from './schemas';

function netOf(long: number | null, short: number | null): number | null {
  return long === null || short === null ? null : long - short;
}

/**
 * M-02 — turn the generic macro providers into one bounded, quarantined
 * extension. Mirrors the XAUUSD macro assembly rules: external title text is
 * quarantined before parsing (instruction-like items are skipped and surface
 * as warnings), and a completely empty fetch returns a typed gap instead of
 * a fake extension.
 *
 * The returned `warnings` are consumed by the packet only when `extension` is
 * null (the "macro unavailable" disclosure); with an extension present the
 * partial-provider warnings travel inside the extension, exactly like the
 * XAUUSD path.
 */
export function assembleGenericMacroExtension(
  symbol: Symbol,
  fetched: GenericMacroFetchResult,
): { extension: GenericMacroExtension | null; warnings: string[] } {
  const warnings: string[] = [];
  const definition = tryGetSymbolDefinition(symbol);
  const supportsEconomicCalendar = definition?.capabilities.supportsEconomicCalendar !== false;
  const supportsCftc = definition?.capabilities.supportsCftc === true;

  const news = fetched.news.status === 'fulfilled' ? fetched.news.value : [];
  const events = fetched.events.status === 'fulfilled' ? fetched.events.value : [];
  const cotRows = fetched.cot.status === 'fulfilled' ? fetched.cot.value : [];
  const partialGaps: string[] = [];

  if (fetched.news.status === 'rejected') partialGaps.push(`${symbol} macro news is unavailable.`);
  if (supportsEconomicCalendar && fetched.events.status === 'rejected') {
    partialGaps.push('The economic calendar is unavailable.');
  }
  if (supportsCftc && fetched.cot.status === 'rejected') {
    partialGaps.push(`COT positioning for ${symbol} is unavailable.`);
  }

  // External news text is untrusted data; quarantine before it can reach the
  // prompt as evidence (audit plan §1.11 / P1-8 parity with the XAUUSD path).
  const headlines: GenericMacroExtension['news'] = [];
  let quarantinedNewsCount = 0;
  for (const item of news.slice(0, GENERIC_MACRO_NEWS_LIMIT)) {
    const title = quarantineExternalText(item.title, EXTERNAL_TITLE_MAX_LENGTH);
    if (title.quarantined) {
      quarantinedNewsCount += 1;
      continue;
    }
    headlines.push({
      title: title.text,
      ...(item.source ? { source: item.source } : {}),
      ...(Number.isFinite(item.publishedAt)
        ? { publishedAt: new Date(item.publishedAt).toISOString() }
        : {}),
    });
  }
  if (quarantinedNewsCount > 0) {
    warnings.push(
      `${quarantinedNewsCount} macro news item(s) were skipped because instruction-like text was quarantined from the title.`,
    );
  }

  // The next high-impact releases for the symbol's own currencies — the
  // fundamental/risk desks reason about this instrument, not the G8 board.
  const currencies = new Set(definition?.currencies ?? []);
  const now = Date.now();
  const upcoming: GenericMacroExtension['events'] = [];
  for (const event of [...events].sort((a, b) => a.date - b.date)) {
    if (event.date < now) continue;
    if (event.currency !== null && !currencies.has(event.currency)) continue;
    const title = quarantineExternalText(event.title, EXTERNAL_TITLE_MAX_LENGTH);
    if (title.quarantined) continue;
    upcoming.push({
      name: title.text,
      currency: event.currency,
      importance: event.importance ?? null,
      date: new Date(event.date).toISOString(),
      actual: event.actual ?? null,
      forecast: event.forecast ?? null,
      previous: event.previous ?? null,
    });
    if (upcoming.length >= GENERIC_MACRO_EVENT_LIMIT) break;
  }

  const cot: GenericMacroExtension['cot'] = supportsCftc
    ? cotRows.slice(-GENERIC_MACRO_COT_WEEKS).map((row) => ({
        reportDate: new Date(row.reportDate).toISOString(),
        dealerNet: netOf(row.dealerLong, row.dealerShort),
        assetNet: netOf(row.assetLong, row.assetShort),
        leveragedNet: netOf(row.leveragedLong, row.leveragedShort),
        otherNet: netOf(row.otherLong, row.otherShort),
      }))
    : undefined;

  const hasAnyData =
    headlines.length > 0 || upcoming.length > 0 || (cot !== undefined && cot.length > 0);
  if (!hasAnyData) {
    return {
      extension: null,
      warnings: [
        `Macro unavailable: news, calendar, and COT providers returned no data for ${symbol}.`,
        ...partialGaps,
      ],
    };
  }
  const extensionWarnings = [...warnings, ...partialGaps];
  if (partialGaps.length > 0) {
    extensionWarnings.push(
      'Generic macro context is partial because one or more providers were unavailable.',
    );
  }

  const extension = GenericMacroExtensionSchema.parse({
    evidenceId: createEvidenceId('macro', symbol),
    source: 'finnhub/marketaux/biquote/biquote-calendar/cftc',
    news: headlines,
    events: upcoming,
    ...(cot && cot.length > 0 ? { cot } : {}),
    warnings: extensionWarnings,
  });
  return { extension, warnings: extensionWarnings };
}
