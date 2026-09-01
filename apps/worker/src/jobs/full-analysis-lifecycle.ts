export type FullAnalysisTerminalAction = 'complete' | 'fail' | 'cancel' | 'discard-lease-loss';

export interface FullAnalysisTerminalInput {
  hasResult: boolean;
  leaseLost: boolean;
  cancelled: boolean;
}

/** Lease ownership always wins: stale workers must never settle or project results. */
export function terminalActionForFullAnalysis(
  input: FullAnalysisTerminalInput,
): FullAnalysisTerminalAction {
  if (input.leaseLost) return 'discard-lease-loss';
  if (input.hasResult) return 'complete';
  if (input.cancelled) return 'cancel';
  return 'fail';
}
