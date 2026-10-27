// SPDX-License-Identifier: Apache-2.0

// Pure extraction of structured trade levels for the Certified Syndicate
// Dossier. Levels arrive in three shapes across runs:
//   1. `rawData.keyLevels` as the typed committee array
//      (`[{ price, kind: 'support'|'resistance'|'trigger'|'invalidation' }]`),
//   2. `rawData.keyLevels` as a loose object (`{ entry, invalidation, tp1… }`)
//      or `rawData.scenarios` report rows, and
//   3. the Arbiter's markdown synthesis (tables, bullets, bold labels).
// The extractor never throws: missing levels render as an em dash so every
// run still populates the 4 Instrument Wells reliably.

export interface SyndicateTradeOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning?: string;
  summary?: string;
  rawData?: Record<string, unknown>;
  /** Model that produced the opinion (telemetry badge). */
  model?: string;
  /** Generation latency in ms (telemetry badge). */
  latencyMs?: number;
}

export interface ExtractedTradeLevels {
  symbol: string | null;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  entry: string;
  invalidation: string;
  tp1: string;
  tp2: string;
  rr: string;
  isVetoed: boolean;
  vetoReason: string | null;
  /** 0..100 for the Tug-of-War consensus bar. */
  bullProbability: number;
  /** True when at least one desk is bullish and one is bearish. */
  dissent: boolean;
}

const EMPTY_LEVEL = '—';

const VETO_PATTERNS: RegExp[] = [
  /\brisk\s+veto\b/i,
  /\bveto(?:ed|es)?\b(?!\s*[:—-]?\s*(?:none|clear|off|n\/a|no|inactive))/i,
  /\bsetup\s+(?:is\s+)?(?:blocked|vetoed)\b/i,
  /\bno[\s-]trade\b/i,
  /\bstand\s+aside\b/i,
  /\bdo\s+not\s+(?:take|enter|trade)\b/i,
  /\binvalidation\s+(?:has\s+been\s+)?breach(?:ed)?\b/i,
  /\bbreach(?:ed)?\s+(?:the\s+)?invalidation\b/i,
  /\bblocked\s+by\s+(?:the\s+)?risk\b/i,
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Coerce a value to a displayable price. Only genuine price-shaped values
 * survive: report scenarios store prose ("Break above the recent high.") in
 * their level fields and a well must never render a sentence.
 */
function asPriceString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 5 });
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/[*_`$€£¥]/g, '').replace(/\s+/g, '');
  return /^[0-9][0-9,]*(?:\.[0-9]+)?$/.test(trimmed) ? trimmed : null;
}

/** Find a labeled number, tolerating emphasis, "(SL)" suffixes, and tables. */
function findNumberAfterLabel(cleanText: string, labelPattern: RegExp): string | null {
  const match = labelPattern.exec(cleanText);
  if (!match) return null;
  const rest = cleanText
    .slice(match.index + match[0].length)
    .split(/\r?\n/)
    .slice(0, 2);
  for (const rawLine of rest) {
    // Strip one "(40% SCALE)" / "(SL)" group so its digits are not captured.
    const line = rawLine.replace(/^\s*\([^)]*\)/, '');
    // Allow a trailing qualifier word ("RUNNER", "TARGET") before the price.
    const number = /^\s*(?:[A-Za-z%]+\s*)*[:|=→\-–—]*\s*([0-9][0-9,]*(?:\.[0-9]+)?)\b/.exec(line);
    if (number?.[1]) return number[1];
  }
  return null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/[*_`>#]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

interface PartialLevels {
  entry?: string | null;
  invalidation?: string | null;
  tp1?: string | null;
  tp2?: string | null;
  rr?: string | null;
}

/** Typed committee shape: an array of `{ price, kind }` key levels. */
function levelsFromKeyLevelArray(items: unknown[], direction: string): PartialLevels {
  const byKind = new Map<string, number[]>();
  for (const item of items) {
    const record = item as { price?: unknown; kind?: unknown };
    if (typeof record?.price !== 'number') continue;
    const kind = typeof record.kind === 'string' ? record.kind : 'support';
    byKind.set(kind, [...(byKind.get(kind) ?? []), record.price]);
  }
  const trigger = byKind.get('trigger')?.[0];
  const invalidation = byKind.get('invalidation')?.[0];
  const magnetic = [...(byKind.get('resistance') ?? []), ...(byKind.get('support') ?? [])].sort(
    (a, b) => a - b,
  );
  // For a long, targets sit above the trigger; for a short, below it.
  const targets =
    direction === 'SELL' && trigger !== undefined
      ? magnetic.filter((p) => p < trigger).reverse()
      : magnetic.filter((p) => trigger === undefined || p > trigger);
  return {
    entry: trigger !== undefined ? asPriceString(trigger) : null,
    invalidation: invalidation !== undefined ? asPriceString(invalidation) : null,
    tp1: targets[0] !== undefined ? asPriceString(targets[0]) : null,
    tp2: targets[1] !== undefined ? asPriceString(targets[1]) : null,
  };
}

/** Loose object shape: `{ entryZone, stopLoss, target1, rr, … }`. */
function levelsFromKeyLevelObject(obj: Record<string, unknown>): PartialLevels {
  const flat = new Map<string, unknown>();
  for (const [key, value] of Object.entries(obj)) flat.set(normalizeKey(key), value);
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = asPriceString(flat.get(normalizeKey(key)));
      if (value) return value;
    }
    return null;
  };
  const pickText = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = flat.get(normalizeKey(key));
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim().replace(/[*_`]/g, '');
      }
    }
    return null;
  };
  const targets = Array.isArray(obj.targets) ? obj.targets : [];
  return {
    entry: pick('entry', 'entryZone', 'entryPrice', 'zone'),
    invalidation: pick('invalidation', 'invalidationLevel', 'stop', 'stopLoss', 'sl'),
    tp1: pick('tp1', 'target1', 'takeProfit1') ?? asPriceString(targets[0]),
    tp2: pick('tp2', 'target2', 'takeProfit2') ?? asPriceString(targets[1]),
    rr: pickText('rr', 'riskReward', 'riskRewardRatio'),
  };
}

/** Report scenarios: choose the row matching the resolved direction. */
function levelsFromScenarios(scenarios: unknown[], direction: string): PartialLevels {
  const wanted = direction === 'SELL' ? 'bearish' : 'bullish';
  const scenario = scenarios.find((row) => (row as { direction?: string })?.direction === wanted);
  if (!scenario) return {};
  const record = scenario as {
    trigger?: unknown;
    invalidation?: unknown;
    targets?: unknown;
    rr?: unknown;
  };
  const targets = Array.isArray(record.targets) ? record.targets : [];
  return {
    entry: asPriceString(record.trigger),
    invalidation: asPriceString(record.invalidation),
    tp1: asPriceString(targets[0]),
    tp2: asPriceString(targets[1]),
    rr: typeof record.rr === 'string' && record.rr.trim().length > 0 ? record.rr.trim() : null,
  };
}

/** Markdown tables / bullets / bold labels from the Arbiter synthesis. */
function levelsFromText(text: string): PartialLevels {
  const clean = stripMarkdown(text);
  const rrMatch =
    /(?:r\s*:\s*r|risk[\s/-]*reward)\s*(?:ratio)?\s*[:=→-]*\s*([0-9]+\s*[:/]\s*[0-9.]+)/i.exec(
      clean,
    );
  return {
    entry: findNumberAfterLabel(clean, /\bentry(?:\s*(?:zone|price|anchor|level))?\b/i),
    invalidation: findNumberAfterLabel(
      clean,
      /\b(?:invalidation(?:\s*(?:level|price|sl))?|stop\s*loss|\bsl\b|\bstop)\b/i,
    ),
    tp1: findNumberAfterLabel(
      clean,
      /\b(?:tp\s*1|take\s*profit\s*1|target\s*1|tp1)\b/i,
    ),
    tp2: findNumberAfterLabel(
      clean,
      /\b(?:tp\s*2|take\s*profit\s*2|target\s*2|tp2)\b/i,
    ),
    rr: rrMatch?.[1] ? rrMatch[1].replace(/\s|\//g, (c) => (c === '/' ? ':' : '')) : null,
  };
}

function firstFilled(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate && candidate.length > 0) return candidate;
  }
  return EMPTY_LEVEL;
}

function findVetoReason(opinions: SyndicateTradeOpinion[], direction: string): string | null {
  const risk = opinions.find((opinion) => opinion.agentName === 'risk');
  if (risk) {
    const text = [risk.reasoning, risk.summary].filter(Boolean).join(' ');
    const phrase = VETO_PATTERNS.find((pattern) => pattern.test(text));
    if (phrase) {
      const sentence = text
        .split(/(?<=[.!?])\s+/)
        .find((part) => phrase.test(part))
        ?.trim();
      return sentence && sentence.length > 0
        ? sentence.slice(0, 220)
        : 'The Risk desk flagged this setup for veto.';
    }
    const confidence = clamp01(risk.confidence);
    if (risk.bias === 'neutral' && confidence < 0.5) {
      return `HOPLITE withheld approval at ${Math.round(confidence * 100)}% confidence — sizing is not permitted until invalidation clarity returns.`;
    }
    if (risk.bias === 'bearish' && direction !== 'SELL') {
      return `HOPLITE dissents from the ${direction} thesis — the setup is vetoed until price action re-aligns.`;
    }
  }
  // A global veto can also appear in the Arbiter text rather than the desk row.
  return null;
}

function textVetoReason(text: string | undefined): string | null {
  if (!text) return null;
  const clean = stripMarkdown(text);
  const phrase = VETO_PATTERNS.find((pattern) => pattern.test(clean));
  if (!phrase) return null;
  const sentence = clean
    .split(/(?<=[.!?])\s+/)
    .find((part) => phrase.test(part))
    ?.trim();
  return sentence && sentence.length > 0 ? sentence.slice(0, 220) : null;
}

/**
 * Extract the certified entry / invalidation / TP1 / TP2 wells, the
 * Tug-of-War probability, and the Hoplite veto state from any combination of
 * structured opinions and the Arbiter's markdown synthesis.
 */
export function extractSyndicateTradeLevels(input: {
  symbol?: string | null;
  opinions?: readonly SyndicateTradeOpinion[];
  text?: string;
}): ExtractedTradeLevels {
  const opinions = [...(input.opinions ?? [])];
  let bullWeight = 0;
  let bearWeight = 0;
  for (const opinion of opinions) {
    const weight = clamp01(opinion.confidence);
    if (opinion.bias === 'bullish') bullWeight += weight;
    else if (opinion.bias === 'bearish') bearWeight += weight;
    // Neutrals split evenly: they neither confirm nor deny the thesis.
    else {
      bullWeight += weight / 2;
      bearWeight += weight / 2;
    }
  }
  const total = bullWeight + bearWeight;
  const bullProbability = total > 0 ? Math.round((bullWeight / total) * 100) : 50;
  const direction: ExtractedTradeLevels['direction'] =
    bullProbability >= 55 ? 'BUY' : bullProbability <= 45 ? 'SELL' : 'NEUTRAL';
  const dissent =
    opinions.some((o) => o.bias === 'bullish') && opinions.some((o) => o.bias === 'bearish');

  // Structured data in canonical desk order, then the render text.
  const ordered = [...opinions].sort((a, b) => {
    const order = ['technical', 'fundamental', 'risk', 'sentiment'];
    return order.indexOf(a.agentName) - order.indexOf(b.agentName);
  });
  const structured: PartialLevels[] = [];
  for (const opinion of ordered) {
    const rawData = opinion.rawData;
    if (!rawData) continue;
    const keyLevels = rawData.keyLevels;
    if (Array.isArray(keyLevels)) {
      structured.push(levelsFromKeyLevelArray(keyLevels, direction));
    } else if (keyLevels && typeof keyLevels === 'object') {
      structured.push(levelsFromKeyLevelObject(keyLevels as Record<string, unknown>));
    }
    if (Array.isArray(rawData.scenarios)) {
      structured.push(levelsFromScenarios(rawData.scenarios, direction));
    }
  }
  const fromText = levelsFromText(input.text ?? '');
  const merge = (field: keyof PartialLevels): string =>
    firstFilled(...structured.map((s) => s[field]), fromText[field]);

  const vetoReason = findVetoReason(opinions, direction) ?? textVetoReason(input.text);

  return {
    symbol: input.symbol?.trim() || null,
    direction,
    entry: merge('entry'),
    invalidation: merge('invalidation'),
    tp1: merge('tp1'),
    tp2: merge('tp2'),
    rr: merge('rr'),
    isVetoed: vetoReason !== null,
    vetoReason,
    bullProbability,
    dissent,
  };
}

/**
 * Deterministic short plan id (`#KSL-4A9F`) derived from the run's identity so
 * the same dossier re-derives the same hash after a page reload.
 */
export function buildSyndicatePlanId(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `#KSL-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 4)}`;
}
