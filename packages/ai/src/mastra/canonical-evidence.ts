/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

export interface CanonicalEvidenceCheck {
  ok: boolean;
  findings: string[];
  numericClaimCount: number;
}

/**
 * Lightweight post-generation guard for canonical chat. It does not pretend
 * to prove prose correctness; it flags numeric/current-market claims when no
 * market-data tool was used so callers can disclose the limitation.
 */
export function checkCanonicalEvidence(
  text: string,
  toolNames: readonly string[],
): CanonicalEvidenceCheck {
  const numericClaimCount = (text.match(/\b\d+(?:\.\d+)?\b/g) ?? []).length;
  const marketToolUsed = toolNames.some((name) =>
    /price|candle|indicator|market|news|calendar|cot|sentiment|correlation|volatility/i.test(name),
  );
  const findings: string[] = [];
  if (numericClaimCount > 0 && !marketToolUsed) {
    findings.push('numeric claims were generated without a market-data tool result');
  }
  return { ok: findings.length === 0, findings, numericClaimCount };
}
