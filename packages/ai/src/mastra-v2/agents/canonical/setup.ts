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

// Canonical agent construction: memory, routing, guarded tools, plugins,
// subagents, guardrails, scorers, and the per-turn tool context.

import { container, getMessageText, metrics, pickAiEnv } from '@kestrel/shared';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';

import { estimateCostUsd } from '@ai/budget/cost';
import { pruneToolsWithJev } from '@ai/jev/tool-pruner';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';
import {
  buildCustomAgentSubagents,
  buildPluginMastraTools,
  getInstalledPluginRuntime,
  mergePluginTools,
  resolvePluginSkills,
  resolvePluginToolsForAgent,
} from '@ai/plugins';
import { resolveSemanticRoutingConfig, routeTurn, type RoutingDecision } from '@ai/routing';
import type { SemanticRoutingAccounting } from '@ai/routing/semantic';
import { DB } from '@ai/runtime/tokens';
import { type ToolContext } from '@ai/runtime/tool-context';
import { domainToolFilter } from '@ai/tools/by-domain';

import { manifestToolsForDomain, type MastraRoutingDomain } from '../../capabilities';
import { buildConversationScorers, buildScorersForExecutionPlan } from '../../evals/scorers';
import { buildGuardrailInputProcessors } from '../../guardrails';
import { assertExecutionPlanRoute } from '../../planning/execution-plan';
import { nativeCanonicalTools, resolveNativeCanonicalTool } from '../../tools/canonical';
import {
  adaptLegacyReadOnlyTool,
  type MastraToolInvocationPart,
} from '../xauusd/legacy-tool-adapter';
import { READ_ONLY_TOOL_NAMES } from './allowlist';
import { mlog } from './log';
import { resolveCanonicalModel } from './model';
import { latestUserModelMessages, messageHistory, systemInstructions } from './prompts';
import { startCanonicalMemory } from './setup-memory';
import type { CanonicalChatSetup, RunMastraCanonicalChatArgs } from './types';

export async function setupCanonicalChat(
  args: RunMastraCanonicalChatArgs,
): Promise<CanonicalChatSetup> {
  if (args.executionPlan) assertExecutionPlanRoute(args.executionPlan, 'canonical-chat');
  const runId = args.runId ?? crypto.randomUUID();
  const generationLedger = args.ledger ?? createGenerationLedger();
  const setupStartedAt = Date.now();
  const semanticRouting = resolveSemanticRoutingConfig(args.settings, args.env, args.signal);

  // Plugin capabilities are per user. Resolve them alongside memory/routing
  // so an uninstalled plugin costs one cached lookup, never a tool prompt.
  const pluginRuntimePromise = getInstalledPluginRuntime(args.userId);

  const memoryPromise = startCanonicalMemory(args);

  // Phase 3 (P0-3): Reuse executionPlan.routingDecision when routeUnified
  // already classified the turn instead of invoking routeTurn a second time.
  const routing: RoutingDecision =
    args.routingDecision ??
    (args.executionPlan as unknown as { routingDecision?: RoutingDecision })?.routingDecision ??
    (await routeTurn({
      userMessage: args.userMessage,
      ...(args.modelOverride ? { modelOverride: args.modelOverride } : {}),
      ...(semanticRouting
        ? {
            semanticRouting: {
              ...semanticRouting,
              accounting: {
                onComplete:
                  args.auxiliaryAccounting?.onComplete ??
                  ((event: Parameters<NonNullable<SemanticRoutingAccounting['onComplete']>>[0]) => {
                    const { modelId, inputChars, outputChars, success, latencyMs } = event;
                    const estimatedCostUsd = estimateCostUsd(
                      modelId,
                      Math.ceil(inputChars / 4),
                      Math.ceil(outputChars / 4),
                    );
                    generationLedger.recordCost(
                      `semantic-routing:${runId}`,
                      'semantic-routing',
                      estimatedCostUsd,
                    );
                    mlog.debug('semantic routing call accounted', {
                      modelId,
                      estimatedCostUsd,
                      success,
                      latencyMs,
                    });
                  }),
              },
            },
          }
        : {}),
    }));
  metrics.observe('mastra_setup_latency_ms', Date.now() - setupStartedAt, {
    tags: { phase: 'routing' },
  });

  const modelStartedAt = Date.now();
  const resolution = resolveCanonicalModel(
    args.settings,
    args.env,
    routing,
    args.modelOverride,
    args.executionPlan,
  );
  metrics.observe('mastra_setup_latency_ms', Date.now() - modelStartedAt, {
    tags: { phase: 'model' },
  });
  const effectivePlan =
    args.plan && ['free', 'pro', 'enterprise'].includes(args.plan) ? args.plan : 'free';
  const legacyTools = domainToolFilter(routing.domain, effectivePlan);
  const disabledTools = new Set(args.settings?.disabledTools ?? []);
  // B-01 (audit 2026-10-18, I-03): migrated names register the native
  // `createTool` counterpart; the remaining names still flow through the
  // legacy adapter. Both share one lifecycle wrapper, so the tool surface
  // (names, events, parts, telemetry) is identical.
  //
  // P2-01: candidate names come from the domain's legacy entries plus the
  // native canonical registrations the manifest allows, so the seven
  // migrated tools keep working when their legacy shims are disabled
  // (`PHASE_TOOLS_SHIMS=0`) and would already be missing from the registry.
  const domainAllowed =
    routing.domain === 'generic'
      ? null
      : new Set<string>(manifestToolsForDomain(routing.domain as MastraRoutingDomain));
  const candidateNames = [
    ...new Set([
      ...Object.keys(legacyTools),
      ...Object.keys(nativeCanonicalTools()).filter(
        (name) => domainAllowed === null || domainAllowed.has(name),
      ),
    ]),
  ];
  const registeredTools = Object.fromEntries(
    candidateNames
      .filter((name) => READ_ONLY_TOOL_NAMES.has(name) && !disabledTools.has(name))
      .map((name): [string, unknown] | null => {
        const native = resolveNativeCanonicalTool(name);
        if (native) return [name, native];
        const legacyTool = legacyTools[name];
        return legacyTool ? [name, adaptLegacyReadOnlyTool(name, legacyTool)] : null;
      })
      .filter((entry): entry is [string, unknown] => entry !== null),
  );
  // Phase 1 (Jev System One) — per-turn fine-grained tool pruning
  // ("When2Call"). The request starts here and is awaited after the memory
  // and plugin promises, so it overlaps them and adds zero serial latency.
  // Pruning can only remove tools and is bounded by READ_ONLY_TOOL_NAMES; with
  // no Jev provider configured it is a no-op.
  const prunedToolsPromise = pruneToolsWithJev({
    userText: getMessageText(args.userMessage),
    domain: routing.domain,
    candidateTools: registeredTools,
    allowedToolNames: READ_ONLY_TOOL_NAMES,
    disabledTools: args.settings.disabledTools ?? [],
    settings: { aiApiKeys: args.settings.aiApiKeys },
    env: args.env,
    signal: args.signal ?? null,
    ledger: generationLedger,
    ledgerEntryId: `${runId}:tool-prune`,
  });

  // §2.4: the memory promise started alongside routeTurn; await it now.
  const memoryOutcome = await memoryPromise;
  metrics.observe('mastra_setup_latency_ms', Date.now() - setupStartedAt, {
    tags: { phase: 'memory' },
  });
  const memory = memoryOutcome.memory;
  const callMemory = memoryOutcome.prepared ? memoryOutcome.prepared.callOptions : null;
  const memoryDegraded =
    memoryOutcome.memoryDegraded || (memoryOutcome.prepared?.memoryDegraded ?? false);
  const memoryBackfill = memoryOutcome.prepared?.backfillAttempted ?? false;
  const pluginRuntime = await pluginRuntimePromise;
  metrics.observe('mastra_setup_latency_ms', Date.now() - setupStartedAt, {
    tags: { phase: 'plugins' },
  });
  // Phase 1 (Jev) — the pruned tool subset (or the unchanged candidate set
  // when Jev is unconfigured). Overlapped with the memory/plugin awaits above.
  const prunedTools = await prunedToolsPromise;

  const toolPartsBuffer: MastraToolInvocationPart[] = [];
  const contextEntries: Array<[string, unknown]> = [
    ['userId', args.userId],
    ['threadId', args.threadId],
    ['runId', runId],
    ['routingDomain', routing.domain],
    ['installedPlugins', pluginRuntime.installedPluginIds],
    ['toolParts', toolPartsBuffer],
  ];
  if (args.onToolEvent) {
    contextEntries.push(['onToolEvent', args.onToolEvent]);
  }
  const requestContext = new RequestContext<Record<string, unknown>>(contextEntries);

  // Dynamic plugin tools/skills for THIS user only. Uninstalled plugins are
  // absent from the prompt entirely (token + focus win, not just permissions).
  const pluginToolRegistrations = resolvePluginToolsForAgent(
    pluginRuntime,
    'canonical-chat',
    args.settings.disabledTools ?? [],
  );
  const pluginTools = buildPluginMastraTools({
    runtime: pluginRuntime,
    tools: pluginToolRegistrations,
    ...(args.signal ? { signal: args.signal } : {}),
    requestContext,
  });
  const agentTools = mergePluginTools(prunedTools, pluginTools);
  const pluginSkills = resolvePluginSkills(pluginRuntime);
  // Optional user-authored agents (custom-agents plugin). Only delegatable
  // agents are built, read-only, and without remote MCP connections so the
  // hot chat path never pays a network round-trip. No catalogs = no work.
  const customAgentSubagents = await buildCustomAgentSubagents({
    runtime: pluginRuntime,
    settings: args.settings,
    env: args.env,
    userId: args.userId,
    threadId: args.threadId,
    ...(args.signal ? { signal: args.signal } : {}),
  });
  // External retrieval is enabled by the canonical allowlist, so detector
  // unavailability must fail closed rather than silently exposing raw external
  // content to an unguarded agent. The mode now derives from the capability
  // manifest (audit plan §1.2) — canonical-chat is `untrusted` → strict+block.
  const guardrailStartedAt = Date.now();
  const { processors: inputProcessors } = buildGuardrailInputProcessors({
    settings: { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
    env: args.env,
    strategy: args.executionPlan?.guardrail.strategy ?? 'block',
    mode: args.executionPlan?.guardrail.mode ?? 'strict',
    // P2-03: the turn's model is already resolved — reuse it for the
    // injection detector instead of resolving the fast tier again.
    model: resolution.model,
  });
  metrics.observe('mastra_setup_latency_ms', Date.now() - guardrailStartedAt, {
    tags: { phase: 'guardrail' },
  });
  // Phase 6 evals: sampled live scoring on conversation turns (5% ratio).
  // I-04 (audit 2026-10-18): when the planner decision is available, the
  // scorer profile derives from the execution plan's evidence policy instead
  // of being chosen by hand.
  const scorerSettings = {
    aiApiKeys: args.settings.aiApiKeys,
    chatModel: args.settings.chatModel,
  };
  const builtScorers = args.executionPlan
    ? buildScorersForExecutionPlan(args.executionPlan, scorerSettings, args.env)
    : buildConversationScorers(scorerSettings, args.env);
  const agent = new Agent({
    id: 'kestrel-mastra-canonical-chat',
    name: 'Kestrel Mastra Canonical Chat',
    description: 'Canonical read-only Kestrel conversational research agent.',
    model: resolution.model as unknown as MastraModelConfig,
    instructions: systemInstructions(
      routing,
      args.customInstructions,
      args.responseStyle,
      args.citeSources,
    ),
    tools: agentTools as never,
    ...(pluginSkills.length > 0 ? { skills: pluginSkills as never } : {}),
    ...(Object.keys(customAgentSubagents).length > 0
      ? { agents: customAgentSubagents as never }
      : {}),
    inputProcessors,
    ...(memory ? { memory } : {}),
  });
  const context: ToolContext = {
    threadId: args.threadId,
    userId: args.userId,
    latestUserMessageText: getMessageText(args.userMessage),
    env: pickAiEnv(args.env),
    signal: args.signal ?? null,
    budget: {
      spent: 0,
      max: args.settings.maxDailyUsd ?? args.env.MAX_DAILY_USD,
    },
    userSettings: args.settings,
    db: container.resolve(DB),
    toolTelemetryBuffer: [],
    ...(args.ledger ? { ledger: args.ledger } : {}),
  };

  return {
    runId,
    agent,
    routing,
    resolution,
    callMemory,
    requestContext,
    toolPartsBuffer,
    context,
    messages: callMemory
      ? await latestUserModelMessages(args.userMessage)
      : await messageHistory(args.history, args.userMessage),
    scorers: builtScorers,
    memoryDegraded,
    memoryBackfill,
  };
}
