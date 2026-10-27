// SPDX-License-Identifier: Apache-2.0

// Public surface of the Sovereign Dossier system (Locked Decision 4A): one
// card, one live circuit, one desk matrix, one cross-examination ledger.

export { SyndicateCircuitLive } from './syndicate-circuit-live';
export { SyndicateClashStrip, type SyndicateClash } from './syndicate-clash-strip';
export { SyndicateDeskGrid, type SyndicateDeskGridProps } from './syndicate-desk-grid';
export {
  extractSyndicateTradeLevels,
  buildSyndicatePlanId,
  type ExtractedTradeLevels,
  type SyndicateTradeOpinion,
} from './extract-trade-levels';
export { InstrumentWells, TugOfWarBar, type InstrumentWell } from './syndicate-instrument-wells';
export { SyndicateDossierCard, type SyndicateDossierCardProps } from './syndicate-dossier-card';
