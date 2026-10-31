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

// Phase 2/3 (Jev System One) — the compact "statistical reference anchor"
// block appended to every desk prompt when a calibration is present (split
// from `jev-packet-scorer.ts` for the file-size gate).

import type { JevPacketCalibration } from './jev-packet-scorer';

/** One-line distribution renderer for the specialist prompt anchor. */
function renderDistribution(probabilities: Record<string, number>): string {
  const entries = Object.entries(probabilities);
  if (entries.length === 0) return 'n/a';
  return entries.map(([label, p]) => `${label} ${p.toFixed(2)}`).join(', ');
}

/**
 * Compact "statistical reference anchor" block appended to every desk prompt
 * when a calibration is present. The desks may disagree with it, but they must
 * reason in its presence.
 */
export function jevCalibrationBlock(calibration: JevPacketCalibration): string {
  return [
    'JEV CALIBRATED REFERENCE (deterministic statistical anchor; you may disagree, but address it):',
    `- Technical bias: ${renderDistribution(calibration.technicalBias.probabilities)}`,
    `- Fundamental bias: ${renderDistribution(calibration.fundamentalBias.probabilities)}`,
    ...(calibration.positioningBias
      ? [`- Positioning bias: ${renderDistribution(calibration.positioningBias.probabilities)}`]
      : []),
    `- Volatility regime score: ${calibration.riskRegime.score.toFixed(2)} (Compressed..Extreme)`,
    `- Setup clarity score: ${calibration.setupQualityScore.score.toFixed(2)} (Noisy..High-Clarity)`,
  ].join('\n');
}
