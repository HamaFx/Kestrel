'use client';

// SPDX-License-Identifier: Apache-2.0

// Core market tools: price, candles, indicators, structure, news, calendar,
// alerts, and journal logging.
import {
  GetCalendarOutputSchema,
  GetCandlesOutputSchema,
  GetIndicatorsOutputSchema,
  GetMarketStructureOutputSchema,
  GetNewsOutputSchema,
  GetPriceOutputSchema,
  LogJournalOutputSchema,
  SetAlertOutputSchema,
} from '@kestrel/shared';

import { GetCalendarPart } from '../get-calendar';
import { GetCandlesPart } from '../get-candles';
import { GetIndicatorsPart } from '../get-indicators';
import { GetMarketStructurePart } from '../get-market-structure';
import { GetNewsPart } from '../get-news';
import { GetPricePart } from '../get-price';
import { LogJournalPart } from '../log-journal';
import { SetAlertPart } from '../set-alert';
import type { PartRegistryMap, PartSchemaMap } from './types';

export type MarketTool =
  | 'get_price'
  | 'get_candles'
  | 'get_indicators'
  | 'get_market_structure'
  | 'get_news'
  | 'get_calendar'
  | 'set_alert'
  | 'log_journal';

export const marketParts = {
  registry: {
    get_price: GetPricePart,
    get_candles: GetCandlesPart,
    get_indicators: GetIndicatorsPart,
    get_market_structure: GetMarketStructurePart,
    get_news: GetNewsPart,
    get_calendar: GetCalendarPart,
    set_alert: SetAlertPart,
    log_journal: LogJournalPart,
  } satisfies Pick<PartRegistryMap, MarketTool>,
  schemas: {
    get_price: GetPriceOutputSchema,
    get_candles: GetCandlesOutputSchema,
    get_indicators: GetIndicatorsOutputSchema,
    get_market_structure: GetMarketStructureOutputSchema,
    get_news: GetNewsOutputSchema,
    get_calendar: GetCalendarOutputSchema,
    set_alert: SetAlertOutputSchema,
    log_journal: LogJournalOutputSchema,
  } satisfies Pick<PartSchemaMap, MarketTool>,
};
