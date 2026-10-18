// SPDX-License-Identifier: Apache-2.0

/**
 * Langfuse configuration + deep-link helpers.
 *
 * P2-06 (audit 2026-10-18) — these live in a leaf module (no Kestrel imports
 * beyond the shared logger) because both the Mastra observability bootstrap
 * (`telemetry.ts`) and the diagnostic trace persistence
 * (`diagnostics/trace-persistence.ts`) need them. Importing them from
 * `telemetry.ts` would create a cycle:
 * `capabilities → tool modules → shared/telemetry → diagnostics →
 * trace-persistence → telemetry → capabilities`.
 *
 * `telemetry.ts` and the barrels re-export everything here, so existing
 * import sites are unchanged.
 */

/** Env keys that gate Langfuse export (same set as `instrumentation.ts`). */
export function isLangfuseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL);
}

/** Langfuse base URL without trailing slash, for deep links. */
export function langfuseBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/+$/, '');
}

/**
 * Deep link to a Langfuse trace by its trace id. Returns `null` when Langfuse
 * is not configured — callers hide the link instead of showing a dead one.
 */
export function langfuseTraceUrl(
  traceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isLangfuseConfigured(env)) return null;
  return `${langfuseBaseUrl(env)}/trace/${encodeURIComponent(traceId)}`;
}
