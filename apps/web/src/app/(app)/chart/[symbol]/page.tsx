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

// SPDX-License-Identifier: Apache-2.0

import { BUILTIN_SYMBOLS, DEFAULT_TIMEFRAME, isKnownSymbol } from '@kestrel/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProChartView } from './_components/pro-chart-view';

interface PageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export async function generateStaticParams() {
  return BUILTIN_SYMBOLS.map((s) => ({ symbol: s.internal }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: isKnownSymbol(symbol) ? `${symbol} · Chart` : 'Chart' };
}

export default async function ChartPage({ params, searchParams }: PageProps) {
  const { symbol } = await params;
  if (!isKnownSymbol(symbol)) notFound();

  const sp = await searchParams;
  const tf = (sp.tf ?? DEFAULT_TIMEFRAME) as
    '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

  return <ProChartView symbol={symbol} tf={tf} />;
}
