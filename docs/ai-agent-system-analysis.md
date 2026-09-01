# End-to-end AI and agentic system review

> **P2 architecture status (September 1, 2026):** Complete for the documented Mastra execution-boundary scope. Routing, capability policy, model resolution, persistence ownership, workflow statuses, and stream ordering now have shared contracts and regression coverage.
>
> **P3 implementation status (September 1, 2026):** Complete for the documented code-level scope. Canonical evidence checks, specialist opinion validation, structured presentation preferences, confidence-calibration helpers, clearer policy-block messaging, stream-contract coverage, browser chat/mutation suites, queue race coverage, memory coverage, and tool timeout/abort coverage are implemented or present in the repository. Remaining work is environment-dependent execution and independent review: running Playwright against a migrated application, the full PostgreSQL RLS/application isolation matrix, production provider-specific validation, and an independent security assessment.

## Executive summary

> **Review status (updated September 1, 2026):** The defined P0 and P1 remediation scopes are complete and verified. The findings below preserve the original architecture review while marking the previously open P0 mutation-authorization and P1 reliability/cost-control risks as resolved.

Kestrel’s AI architecture is a **hybrid, staged migration from a legacy AI SDK agent system to Mastra**.

The system currently has four meaningful execution paths:

1. **Canonical conversational Mastra agent**
   - General read-only chat.
   - Streams provider tokens.
   - Uses routing, memory, guardrails, tool filtering, telemetry, and budget reservations.

2. **Specialized XAUUSD Mastra path**
   - Handles gold-specific conversation and verified research reports.
   - Uses deterministic market-data packets.
   - Supports structured report generation, deterministic verification, bounded repair, and follow-up questions.

3. **Quick / Standard / Full committee workflows**
   - Collect one shared research packet.
   - Run specialist agents in parallel.
   - Optionally synthesize their opinions with a fusion agent.
   - Full mode is strict: a failed specialist fails the whole analysis.

4. **Durable Full-mode worker path**
   - Web request inserts a database queue row.
   - Worker atomically claims it using a lease.
   - Worker resumes or starts a Mastra workflow.
   - Terminal state is projected back to the queue and exposed through a polling endpoint.

The design is generally strong in:

- user and tenant scoping,
- explicit read-only tool allowlists,
- confirmation-based mutations,
- structured evidence and report verification,
- durable queue ownership,
- idempotent message persistence,
- budget reservation/reconciliation,
- model circuit breaking,
- bounded retries and timeouts,
- observability correlation.

However, the system is also **complex and duplicated**. There are several independent representations of:

- chat history,
- workflow state,
- telemetry,
- tool registration,
- model resolution,
- routing,
- mutation state,
- status names,
- and budget state.

That creates the largest overall risk: individual components are carefully hardened, but the **composition edges between them** are where correctness, cost, and security failures are most likely.

---

# 1. High-level architecture

```text
Browser
  │
  │ useChat / DefaultChatTransport
  │
  ▼
POST /api/chat
  │
  ├─ Authentication
  ├─ Per-user rate limit
  ├─ Body/schema validation
  ├─ Thread ownership check
  ├─ Message extraction
  ├─ Injection gate
  ├─ Mutation classification
  ├─ Analysis-mode resolution
  ├─ Model resolution
  └─ Route selection
       │
       ├─ Mutation draft workflow
       ├─ Full-analysis durable queue
       ├─ XAUUSD conversation stream
       ├─ XAUUSD verified report
       ├─ Quick/Standard committee workflow
       └─ Canonical Mastra streaming agent
```

Supporting infrastructure:

```text
Mastra
  ├─ Agent instances
  ├─ Workflow graphs
  ├─ Native memory
  ├─ Workflow snapshots
  ├─ Langfuse observability
  └─ Mastra logger

Kestrel / Drizzle
  ├─ Chat threads/messages
  ├─ Tenant ownership
  ├─ AI budget ledger
  ├─ Queue rows and leases
  ├─ Tool telemetry
  ├─ Turn telemetry
  ├─ Audit logs
  ├─ Mutation execution ledger
  └─ Persistence outbox

Worker
  ├─ Full-analysis queue polling
  ├─ Lease heartbeats
  ├─ Retry/requeue
  ├─ Stale-run recovery
  └─ Terminal result projection
```

---

# 2. User message lifecycle

## 2.1 Chat page loading

For `/chat/[threadId]`:

1. NextAuth session is loaded.
2. User ID is selected.
3. `getThread(userId, threadId)` checks ownership.
4. Messages are loaded with a user- and tenant-scoped query.
5. User settings are loaded.
6. Messages are converted to `UIMessage` objects.
7. The client receives:
   - initial messages,
   - thread metadata,
   - selected analysis mode,
   - selected chat model,
   - custom instructions,
   - feature preferences.

The page correctly avoids trusting a thread ID alone. Thread queries include:

```text
thread ID
user ID
tenant ID
```

This is important because the route would otherwise be vulnerable to IDOR.

## 2.2 Message submission in the browser

The client uses `useChat()` with a custom `DefaultChatTransport`.

Before the request:

- The current `threadId` is added.
- The current analysis mode is read from a ref.
- A one-turn model override may be attached.
- CSRF token is added.
- Custom instructions are sent in `X-AI-Prefs`.
- User text or image file parts are sent.

The use of refs for analysis mode and model overrides is a good detail. It avoids a race where the user changes a selector and submits before React state has re-rendered.

The transport supports three server response forms:

1. Native AI SDK stream.
2. Legacy/custom SSE transformed into AI SDK events.
3. JSON queue response transformed into a polling stream.

That provides a unified UI contract, but it also means the transport is effectively a **protocol translation layer** with substantial correctness responsibility.

---

# 3. `/api/chat` request processing

The route performs the following sequence.

## 3.1 Authentication and rate limiting

The route is wrapped with `withAuth`.

Then it applies:

```text
withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT)
```

The default is 30 requests per minute.

Strengths:

- rate limiting happens before model execution;
- it is user-keyed;
- the response includes `Retry-After` and rate-limit headers.

Potential issue:

- the rate limit is applied before body validation and before checking whether the request is a harmless malformed request;
- this is usually acceptable, but abusive malformed traffic can consume the same quota as valid AI turns.

## 3.2 Request validation

The body requires:

- UUID `threadId`;
- optional model override;
- optional analysis mode;
- 1–100 messages;
- maximum 50,000 characters per message;
- maximum 50 parts per message.

The route also requires the final message to be from the user and validates the user’s parts against `UserMessagePartsSchema`.

This is a solid boundary. The server does not simply trust the client’s complete message history.

Important nuance: the route receives up to 100 messages, but most actual model paths use only a bounded subset:

- canonical explicit history: last 60;
- native memory: last 20;
- backfill: last 40.

## 3.3 Optional custom instructions

The `X-AI-Prefs` header is parsed and `customInstructions` is sanitized.

The sanitizer:

- removes control characters;
- trims and truncates to 2,000 characters;
- rejects text containing words such as:
  - `ignore`,
  - `system`,
  - `developer`,
  - `tool`,
  - `execute`,
  - `mutation`,
  - `safety`,
  - `policy`,
  - `reveal`,
  - `secret`,
  - `memory`,
  - `permission`,
  - `instruction`,
  - `jailbreak`,
  - `override`.

The instructions are then embedded as:

```text
PRESENTATION PREFERENCES
<preferences>...</preferences>
```

and explicitly described as data rather than policy.

This is a reasonable defense, but keyword filtering is not a complete security boundary. It can:

- reject innocent preferences;
- miss semantically equivalent injection language;
- create confusing behavior because the client does not know the preference was dropped.

The stronger defense is the placement and framing inside the system prompt, combined with the Mastra injection processors. The lexical filter should be considered supplementary rather than authoritative.

---

# 4. Server-side routing

The route computes:

```text
userText
priorReport
resolvedMode
```

Then it applies routing gates in this order:

1. Injection/jailbreak block.
2. Mutation workflow.
3. Lexical mutation block.
4. Full-mode queue.
5. Specialized XAUUSD path.
6. Quick/Standard symbol workflow.
7. Canonical streaming agent.

This order is mostly correct because safety and mutation controls execute before model calls.

---

# 5. Injection and mutation controls

## 5.1 Deterministic injection block

The route blocks prompts matching patterns such as:

```text
ignore previous instructions
system:
developer:
DAN mode
```

This is intentionally narrow and deterministic.

Mastra agents also receive `PromptInjectionDetector` processors.

Research paths use:

```text
strategy: block
```

Conversation paths use:

```text
strategy: rewrite
```

Research guardrails are strict in production, meaning detector-model unavailability should reject the research turn.

Canonical chat uses strict guardrails too:

```ts
buildGuardrailInputProcessors({
  strategy: 'block',
  mode: 'strict',
});
```

That is a strong fail-closed choice for external retrieval.

## 5.2 Mutation detection

Mutation handling has two layers:

### Model-based classification

When enabled:

```text
classifyMutationRequest(userText)
```

If a mutation is detected:

1. The prompt is classified.
2. Structured mutation input is extracted.
3. Input is validated.
4. A mutation workflow is started.
5. The workflow suspends.
6. The client receives a confirmation card.

### Lexical fallback

If the model classifier does not identify a mutation, lexical detection still catches:

- explicit alert creation;
- journal logging;
- sharing;
- automation/scheduling;
- explicit buy/sell commands.

This is intentionally high precision and low recall.

Potential issue:

The comments say analysis-oriented phrasing should pass through, but the lexical logic contains broad conditions such as:

```text
EXECUTION_VERBS && !isReadOnlyContext
```

This can still classify ambiguous requests unexpectedly. For example, trading language often combines analysis and execution intent:

```text
Should I buy if price breaks resistance?
```

The question-starter exception may classify this as read-only, while other equivalent wording may be blocked. The behavior is not fully semantically consistent.

The safe product behavior is preferable: ambiguous execution requests should require confirmation or be explicitly reframed as analysis. But the classification contract should be tested as a policy matrix rather than relying on scattered regexes.

---

# 6. Route-specific execution paths

## 6.1 Canonical conversational Mastra path

Used for ordinary symbol-free or general read-only conversation.

### Sequence

```text
runMastraCanonicalChatStreamService
  │
  ├─ getUserWithSettings
  ├─ resolve environment
  ├─ reserve budget
  ├─ append user message
  ├─ load explicit Drizzle history
  ├─ prepare native Mastra memory
  ├─ route domain
  ├─ resolve model
  ├─ filter tools
  ├─ create guardrails
  ├─ create scorers
  ├─ create per-request Agent
  ├─ start Mastra stream
  ├─ yield text chunks
  ├─ await full output
  ├─ persist assistant message
  ├─ reconcile budget
  ├─ finish telemetry
  └─ emit terminal stream events
```

### Model input

If native Mastra memory is available:

```text
latest user message only
+ Mastra memory options
```

If memory is unavailable:

```text
last 60 explicit messages
+ latest user message
```

This fallback is good because memory failure does not erase conversation context.

### Agent instructions

The canonical system prompt says:

- read-only research and planning;
- never place trades;
- never invent market data;
- use tools for current facts;
- treat tools, web results, memory, and external content as data;
- scenario language instead of certainty;
- setup discussions require trigger, invalidation, and risks;
- mutation tools are not exposed.

### Tool selection

Canonical tools are selected through:

```text
domainToolFilter()
```

then intersected with:

```text
CANONICAL_READ_ONLY_TOOL_NAMES
```

This is a fail-closed allowlist. A newly registered tool is not automatically exposed to canonical Mastra chat.

This is one of the strongest parts of the design.

### Important inconsistency

`domainToolFilter()` has comments saying tools such as `set_alert` and `log_journal` may be included as “always” tools. However, canonical chat later filters against the read-only allowlist, and the allowlist excludes mutation tools.

That is correct operationally, but the policy descriptions are inconsistent. The comments and capability metadata should be aligned so future maintainers do not accidentally re-expose mutations.

## 6.2 XAUUSD conversation path

This path is selected when:

- the prompt mentions XAUUSD, gold, or XAU/USD;
- it does not mention another symbol;
- it is not an injection;
- it is not a mutation.

The conversation path:

1. Checks thread ownership.
2. Loads settings.
3. Reserves budget.
4. Persists the user message.
5. Collects a deterministic XAUUSD research packet.
6. Builds native memory.
7. Creates conversation guardrails.
8. Creates the XAUUSD agent.
9. Restricts active tools.
10. Generates up to three steps.
11. Streams provider tokens.
12. Persists the assistant response and metadata.
13. Reconciles budget.

The packet is placed in authenticated request context and serialized into the model instructions.

The model is explicitly told:

- use packet evidence by default;
- do not call broad packet/price/candle/indicator tools again when packet context exists;
- use narrower tools only when requested;
- a saved report is not current market evidence.

This is a strong evidence-boundary design.

## 6.3 XAUUSD verified report path

Deep XAUUSD research uses a workflow:

```text
collect-packet
  → generate
  → repair loop
  → finalize
```

### Packet collection

The packet is deterministic and fail-closed.

If required technical data is unavailable, the workflow returns a blocked result rather than asking the model to improvise.

### Generation

The model is not allowed to call tools during report synthesis:

```text
toolChoice: none
maxSteps: 1
```

It must return a structured `XauusdResearchReport`.

### Verification

The verifier checks:

- schema;
- evidence IDs;
- source references;
- numeric claims;
- narrative numeric claims;
- temporal disclosure;
- data quality;
- confidence;
- scenario safety;
- timeframe conflicts.

### Repair

There are at most two additional repair attempts.

The repair prompt includes verifier findings. This is a good bounded recovery model.

### Deterministic patch

After repair exhaustion, the only automatic patch currently allowed is a timeframe-conflict disclosure. It does not invent prices or conclusions.

This is appropriately conservative.

## 6.4 Quick / Standard / Full committee path

The symbol-research workflow is:

```text
collect-packet
  → parallel specialists
  → verify
  → fusion
```

Specialist membership:

```text
single:   technical
quick:    technical
standard: technical + fundamental
full:     technical + fundamental + risk + sentiment
```

### Specialist visibility

Each specialist receives:

- authenticated request context;
- the same trusted packet;
- thread memory;
- read-only memory options;
- research guardrails;
- research scorers.

The specialist memory options use:

```text
readOnly: true
```

so specialists can read context without writing internal opinions into the user’s conversation memory.

This is a very good design decision.

### Specialist behavior

Specialists use:

```text
toolChoice: none
maxSteps: 1
structuredOutput: OpinionSchema
```

Therefore, specialists do not independently fetch data. They reason over the shared deterministic packet.

This avoids:

- inconsistent snapshots;
- duplicated market-data calls;
- divergent evidence;
- unnecessary tool costs.

### Full strictness

Full mode throws `MastraModeStrictFailureError` if any required specialist fails.

This avoids returning a misleading partial committee result.

For Quick and Standard, specialist failures can be represented as explicit failure markers and the workflow can continue.

### Fusion

Standard and Full use a fusion agent that receives:

- the packet;
- specialist opinions;
- the original prompt.

It does not use tools.

The fusion output is user-facing text.

### Main concern

The workflow’s comments describe `single` as part of the generalized committee workflow, but the HTTP route often sends ordinary Single-mode XAUUSD traffic through the specialized XAUUSD paths instead. This is not inherently wrong, but the mode semantics are spread across:

- `resolveMode`;
- route-level XAUUSD conditions;
- `mastraXauusdChatKind`;
- `SPECIALISTS_BY_MODE`;
- legacy mode helpers.

That makes it difficult to answer with certainty which exact path a new prompt will take without tracing several modules.

A centralized route decision object would improve this substantially.

---

# 7. Durable Full-analysis lifecycle

Full mode is asynchronous.

## 7.1 Enqueue

The web request:

1. Authenticates the user.
2. Validates the message.
3. Resolves the symbol and mode.
4. Loads user settings.
5. Resolves the model.
6. Rejects a model override because it is not serializable in the queue schema.
7. Creates a deterministic run ID from:
   ```text
   hash(userId + idempotencyKey)
   ```
8. Inserts a `full_analysis_queue` row.
9. Creates a budget reservation in the same transaction.
10. Projects a pending workflow snapshot.
11. Returns:

```json
{
  "type": "analysis-queued",
  "jobId": "...",
  "status": "queued"
}
```

The enqueue transaction and idempotency behavior are well designed.

## 7.2 Worker claim

The worker:

1. Polls the queue.
2. Reads pending candidates.
3. Applies tenant partition ownership.
4. Atomically updates one row from `pending` to `running`.
5. Increments the attempt count.
6. Stores worker ID.
7. Stores lease expiry.
8. Projects the claimed state into Mastra storage.

Only the worker owning the lease may heartbeat, complete, requeue, or fail the run.

This prevents stale workers from overwriting requeued work.

## 7.3 Worker execution

The worker:

1. Loads settings using user and tenant predicates.
2. Validates the model snapshot.
3. Validates symbol and safe research prompt.
4. Resumes or adopts the budget reservation.
5. Persists the user message with a durable idempotency key.
6. Calls `runMastraMode()` with:
   - mode `full`;
   - workflow ID `full-analysis`;
   - enqueue-time model snapshot;
   - worker signal;
   - lease-abort signal;
   - durable resume enabled.
7. Heartbeats the lease.
8. Persists the assistant message.
9. Projects the result to the queue.
10. Reconciles the budget.

## 7.4 Failure and retry

Retryable failures include:

- timeout;
- abort;
- network/fetch failure;
- rate limiting;
- temporary provider failure;
- connection failures.

The queue retries until `MAX_ANALYSIS_ATTEMPTS = 3`.

Quota rejection is treated as permanent.

Non-retryable errors are terminal and return no partial result.

Stale running rows are periodically:

- requeued if attempts remain;
- failed if the attempt budget is exhausted.

This is a mature durable-job design.

## 7.5 Polling

The browser polls every 2–10 seconds, with a maximum five-minute polling window.

It translates:

- success into a synthetic text stream;
- failure into an error event;
- unknown status into an error;
- repeated network failures into an error.

A concern is that polling response `progress` is currently generally empty:

```ts
progress: [];
```

The queue does project Mastra snapshots, but `getFullAnalysisRun()` does not appear to expose meaningful workflow-step progress. As a result, the UI’s deliberation display may not reflect real specialist progress for durable Full runs.

This is a product/observability gap rather than a correctness vulnerability.

---

# 8. What each agent can see

## 8.1 Canonical agent

Potential context:

- latest user message;
- up to 20 native memory messages;
- or up to 60 explicit history messages;
- resource-scoped working memory;
- semantic recall across the user’s resource;
- authenticated user ID;
- thread ID;
- run ID;
- routing domain;
- user settings;
- custom presentation preferences;
- domain-filtered read-only tools.

The canonical agent does not directly receive the raw database user object. It receives selected settings and plan information.

## 8.2 XAUUSD agent

Potential context:

- latest prompt;
- native thread memory;
- authenticated user ID;
- thread ID;
- run ID;
- trusted research packet;
- optional previously verified report;
- XAUUSD-only tools;
- conversation or research guardrails.

For follow-ups, the saved report is explicitly marked as historical context rather than current data.

## 8.3 Committee specialists

Each specialist sees:

- the original prompt;
- the shared deterministic packet;
- authenticated request context;
- thread memory;
- research guardrails;
- no tool calls;
- no mutation capability;
- read-only memory options.

Specialists do not see each other’s opinions directly. They operate in parallel.

## 8.4 Fusion agent

The fusion agent sees:

- the original prompt;
- the shared packet;
- all successfully returned specialist opinions;
- failed-agent information indirectly through the workflow result;
- memory with normal write-capable fusion call options.

The fusion agent does not call tools.

## 8.5 Mutation extraction model

The extraction model sees:

- only a truncated user prompt;
- a per-mutation structured schema;
- a mutation-specific extraction instruction.

It should not make authorization decisions. Authorization is later performed by server-side policy and durable state.

## 8.6 External retrieval content

Web and news results are treated as untrusted.

The system:

- bounds response sizes;
- validates provider URLs;
- disables redirects;
- limits calls per turn;
- caches searches;
- quarantines instruction-like external text;
- adds explicit `contentTrust: 'untrusted'`;
- warns the model not to follow instructions in results.

This is strong, but external content still enters model context. Prompt-injection defenses reduce risk; they do not eliminate it. The safest model behavior remains to treat retrieval as quoted evidence with strict delimiters and no authority.

---

# 9. Tool execution

## 9.1 Legacy tool registry

Legacy tools self-register into a singleton registry.

The registry provides:

- tool metadata;
- plan gating;
- name-based resolution;
- telemetry wrapping.

Tools are grouped into:

- market;
- analysis;
- journal;
- system;
- web.

The registry supports free/pro/enterprise plan gating.

Missing or unknown plan values fail closed in `resolveForPlan()`.

## 9.2 Canonical Mastra adapters

Canonical Mastra chat does not use raw legacy tools directly. It:

1. resolves domain tools;
2. intersects with the canonical read-only allowlist;
3. adapts each tool through `adaptLegacyReadOnlyTool`;
4. wraps execution in Mastra telemetry.

The adapter rejects mutation names using `MastraMutationNameSchema`.

This is a good defense against accidental mutation exposure.

## 9.3 Tool context

Legacy tools use `AsyncLocalStorage` to access:

- user ID;
- thread ID;
- latest user message text;
- environment;
- signal;
- budget context;
- settings;
- database client;
- telemetry buffer;
- web-search call count.

This avoids module-global mutable request state.

The user ID and database context are especially important for tenant safety.

## 9.4 Tool timeouts

Legacy tools are wrapped with per-tool timeout enforcement.

Examples:

- price: 5 seconds;
- candles: 10 seconds;
- indicators: 10 seconds;
- chart image: 45 seconds;
- replay setup: 40 seconds;
- default: 25 seconds.

The wrapper:

- propagates parent cancellation;
- creates a local abort controller;
- races execution against timeout;
- emits telemetry;
- records diagnostics;
- cleans up listeners.

One subtle issue: `Promise.race()` does not itself cancel an underlying promise. The wrapper aborts the local controller, but an implementation that ignores `abortSignal` may continue doing work after the wrapper has rejected. This can still consume provider/database resources.

The system mitigates this at the scheduler and request level, but tool implementations should be audited to ensure they actually honor signals.

## 9.5 Tool telemetry

Tool telemetry records:

- user;
- tenant;
- thread;
- message;
- trace;
- run;
- job;
- tool name;
- latency;
- success;
- error code;
- output size.

Mastra tools currently write telemetry asynchronously with `void recordToolTelemetry(...)`.

This is intentionally non-blocking, but it means:

- telemetry can be lost during process termination;
- tool completion is not coupled to durable telemetry completion;
- tool telemetry failures depend on the persistence outbox path.

For legacy tools, telemetry is buffered and appears designed for batch flushing, but the inspected canonical Mastra path creates `toolTelemetryBuffer` without an obvious final flush in the shown code. This is a key area to verify carefully: if `executeMastraTool` uses direct asynchronous inserts while legacy wrappers buffer, telemetry semantics differ between agent types.

---

# 10. Persistence behavior

## 10.1 User message persistence

The route-specific services generally persist the user message before model execution.

User messages use idempotency keys such as:

```text
ui:<client-message-id>
mastra-mode:<thread>:<message>:user
analysis-job:<run>:user
```

The database has a unique idempotency index.

This protects against:

- browser retries;
- provider fallback duplication;
- worker retries;
- repeated queue processing.

## 10.2 Assistant message persistence

Assistant messages are persisted after full model completion.

The message stores:

- rendered text;
- structured parts;
- report metadata;
- model/run identifiers;
- tool or committee metadata.

Assistant persistence also uses idempotency keys.

If persistence fails, the persistence outbox receives a replay record.

This is good, but the user-facing stream may already have shown the answer before persistence failure. The stream communicates:

```text
turn-complete: persistence-failed
```

which is honest, but the UI behavior should be checked to ensure it does not display the message as fully durable.

## 10.3 Parts stripping

Stored tool outputs have fields stripped or replaced:

```text
imageDataUrl
image
data
candles
rawResponse
```

This reduces storage growth and limits accidental persistence of large/private payloads.

The tradeoff is that reloads may not reconstruct every rich tool card exactly. The system intentionally favors bounded storage over complete raw replay.

## 10.4 Thread ownership

Thread and message reads/writes consistently include:

- user ID;
- tenant ID;
- thread ID.

`requireTenantIdForUser()` resolves membership and fails if missing.

The database schema also includes tenant IDs and RLS migration support.

This is a strong defense-in-depth model.

---

# 11. Native Mastra memory

## 11.1 Memory layers

Mastra memory includes:

1. Last-message history.
2. Resource-scoped working memory.
3. Semantic recall.
4. Optional observational memory.

The resource is the authenticated user ID.

This gives:

- thread-local history;
- user-wide preferences;
- cross-thread semantic recall;
- optional worker-side background observation.

## 11.2 Working-memory seed

Settings are converted to markdown such as:

```text
# User Preferences
- Default symbol
- Language
- Timezone
- Preferred chat model
- Preferred analysis models
- Embedding model
```

The seed runs only when no working memory exists.

Potential risk:

The working memory becomes agent-maintained after seeding. If the agent can update it, there should be a clear policy for:

- which fields it may update;
- whether user settings remain authoritative;
- how malicious or accidental model updates are reconciled;
- whether sensitive settings could be written into memory.

The current comments imply Kestrel settings are initially authoritative, but the long-term authority model is not fully explicit.

## 11.3 History backfill

Legacy Drizzle messages are copied into Mastra storage once per thread.

The backfill has:

- process-local in-flight locking;
- durable claim state;
- lease expiry;
- ID-based reconciliation;
- exclusion of the currently persisted message;
- best-effort failure behavior;
- durable failure markers.

This is one of the more carefully engineered migration paths.

Potential issue:

The backfill lock key is:

```text
userId:threadId
```

and the durable state is also user/thread scoped, which is correct. However, the backfill is best-effort and callers proceed with either native memory or explicit history. In a concurrent migration failure, different requests could use different history representations during the same period. This is acceptable for availability but can produce inconsistent context windows.

---

# 12. Model resolution

Model resolution supports:

- user-saved model;
- one-turn override;
- operator-pinned model;
- purpose-specific defaults;
- BYOK keys;
- environment fallback;
- provider priority;
- circuit-breaker skipping;
- durable enqueue-time snapshots.

## 12.1 BYOK behavior

If user keys exist, the system uses only the user’s stored keys.

If no user keys exist, it can use server environment fallback keys.

This is a clear and reasonable policy.

## 12.2 Durable snapshot behavior

Full jobs persist:

```text
providerId
bareModelId
modelId
```

The worker resolves that exact provider/model and rejects failover if it is no longer available.

This is important: a queued job should not silently execute under a different model than the one the user/route admitted.

## 12.3 Circuit breaker

The circuit breaker is in-memory and per process.

After repeated failures:

- provider/model is temporarily skipped;
- it auto-closes after 30 seconds;
- success resets state.

This helps within a process but does not coordinate across:

- Vercel instances;
- worker instances;
- horizontally scaled deployments.

That limitation is documented. If provider outages become material, a shared provider-health table or distributed cache would be more reliable.

## 12.4 Semantic routing cost

Semantic routing may make an extra cheap LLM call before the actual chat model.

It has:

- 2-second timeout;
- confidence threshold;
- 60-second cache;
- 200-entry bounded cache;
- keyword fallback.

Important accounting concern:

The semantic classifier’s accounting callback exists, but the canonical route’s shown call to `routeTurn()` does not appear to pass an accounting callback. Therefore, semantic routing calls may not be included in the same budget/cost accounting as the primary turn.

This should be verified and likely corrected. Auxiliary LLM calls should either:

- reserve/reconcile against the same turn budget;
- be explicitly included in a composite cost;
- or be disabled for users with insufficient budget.

Otherwise the daily budget can undercount real provider spend.

---

# 13. Budget controls

The budget system uses:

1. Atomic daily spend counter.
2. Durable reservation ledger.
3. Per-turn reservation.
4. Reconciliation with observed cost.
5. Release on failure/abort.
6. Background recovery of stale reservations.

This is much stronger than merely summing telemetry after the fact.

## 13.1 Reservation flow

A normal turn:

```text
tryReserveBudget
  → daily_ai_spend increment
  → ai_budget_reservations row
  → model execution
  → reconcile(actual cost)
```

A failed turn:

```text
release reservation
```

A durable Full job:

```text
enqueue transaction reserves budget
  → worker resumes reservation
  → worker reconciles or releases
```

## 13.2 Positive behavior

The budget handle is idempotent at the in-process level.

The durable ledger reconciliation is transactionally guarded by reservation status.

Repeated terminal callbacks should not double-apply deltas.

## 13.3 Material risk: reconciliation failure

If reconciliation or release fails, the handle logs the failure and leaves the reservation open.

That is correct from a conservation perspective, but it creates a dependency on the budget recovery job. If recovery is delayed or broken:

- users may be incorrectly blocked;
- reserved spend may remain inflated;
- operational spend accounting can drift.

The recovery job should have an explicit health SLI and alert.

## 13.4 Estimate quality

The queue reserves a fixed `0.05` USD estimate for Full analysis.

This is conservative only if actual Full analyses generally cost less than that. The final cost uses token-based estimates and static/catalog rates.

Unknown models use a fallback cost rate for non-strict estimates, while strict known pricing exists separately.

This is a potential undercount risk if:

- a new model is not in the pricing table;
- provider markup differs materially;
- auxiliary calls are omitted;
- multiple workflow generations are not all represented in stats.

For financial safety, production budget reconciliation should prefer strict pricing and fail closed on unknown models.

---

# 14. Mutation workflow review

Mutation workflows are separated from read-only agents.

## 14.0 P0 remediation status

The P0 mutation-safety work described in this review has been implemented:

- registered system actions now require server-side admin authorization when marked `requiresAdmin`;
- the authorized action and authorization decision are bound into the mutation proof/context;
- authorization is revalidated during draft, resume, and final execution;
- confirmation token and immutable mutation context tampering are rejected;
- business writes, audit records, and the mutation execution ledger are committed atomically;
- replay and concurrent confirmations are serialized and protected;
- mutation tools remain excluded from canonical read-only Mastra agents.

This closes the previously identified P0 authorization gap. The remaining mutation risks are defense-in-depth and broader integration coverage, not an identified bypass in the reviewed path.

## 14.1 Draft

The model extracts a mutation input into a typed schema.

The workflow then:

- validates the input;
- validates system action registry membership;
- computes a stable input digest;
- generates a random token;
- stores only an HMAC digest;
- sets a 15-minute expiry;
- suspends the workflow.

The raw confirmation token is sent to the browser.

## 14.2 Confirmation

The confirm route:

1. Authenticates the user.
2. Finds the workflow run.
3. Parses persisted mutation context.
4. Verifies the run belongs to the authenticated user.
5. Revalidates token, digest, mutation, user, thread, and expiry.
6. Checks the mutation execution ledger.
7. Runs the workflow resume.
8. Executes an atomic business write.
9. Writes audit information and execution ledger data.
10. Persists a confirmation assistant message.

This is a proper approval flow rather than a client-side boolean.

## 14.3 Token security

The token is:

- high entropy;
- short-lived;
- HMAC-bound to:
  - token;
  - mutation;
  - user;
  - input digest;
  - expiry;
- compared with timing-safe equality.

The raw token is not persisted.

## 14.4 Replay protection

Replay protection exists at multiple layers:

- workflow leaves suspended state;
- mutation execution ledger;
- unique execution identity;
- atomic executor;
- conflict responses for concurrent confirmation.

This is strong.

## 14.5 System actions

System actions are allowlisted and may require admin privileges.

`SYSTEM_ACTION_REGISTRY` includes:

```text
requiresAdmin: true
```

This requirement is now enforced at the shared mutation policy/composition boundary and rechecked at workflow resume/final execution. The role is obtained from authenticated server-side state; it is not accepted from the model or client. The registered action, user, tenant/thread context, input digest, expiry, and authorization decision are bound into the persisted mutation proof.

The system action registry is therefore authorization-enforced, not merely registration-enforced.

---

# 15. Streaming and transport behavior

## 15.1 Server stream

The stream emits:

```text
text-start
text-delta*
data-multi-agent-meta
text-end
turn-complete
```

On failure it can emit:

```text
turn-complete
error
text-end
```

The stream finalizer ensures budget completion, release, or interruption persistence is not run twice.

## 15.2 Client adapter

The client converts custom SSE into AI SDK data-stream events.

It:

- validates every event with `ChatStreamEventSchema`;
- detects malformed JSON;
- detects malformed event shapes;
- avoids treating truncated streams as successful;
- emits an error for protocol failure;
- closes cleanly on user abort;
- adapts queued jobs into synthetic text streams.

This is robust.

## 15.3 Ordering issue

In `mastraStreamResponse`, successful completion emits:

```text
data-multi-agent-meta
text-end
turn-complete
```

The static response helpers emit:

```text
text-start
text-delta
text-end
data-multi-agent-meta
```

These are different event orders.

The client appears able to tolerate both, but a single canonical ordering would reduce protocol ambiguity. Metadata should ideally be emitted either:

- before `text-end` consistently; or
- after `text-end` consistently.

## 15.4 Failure semantics

The stream finalizer persists an interruption message:

```text
_Stream interrupted — please retry._
```

This is useful, but it can create an additional assistant message in the history when the client aborts after partial text has already appeared. The UI should make sure this does not look like a second answer or duplicate assistant turn.

## 15.5 Durable Full metadata

Polling synthesis marks the metadata as transient:

```text
transient: true
```

The worker separately persists the actual assistant metadata in the database.

This is reasonable, but the client’s immediate in-memory message and reloaded persisted message may have different metadata shapes. A shared public metadata schema would improve consistency.

---

# 16. Observability

The architecture correlates a run across:

- pino logs;
- Mastra traces;
- Langfuse;
- DB turn telemetry;
- DB tool telemetry;
- workflow snapshots;
- scores;
- queue rows.

The principal identifiers are:

```text
runId
traceId
userId
threadId
jobId
```

This is excellent in concept.

## 16.1 Good design choices

- Prompts and tool outputs are not automatically exported to Langfuse.
- Langfuse sampling is configurable.
- Worker and web logs use run identity.
- Mastra logger routes through shared logging.
- Workflow lifecycle logs include step IDs.
- Tool errors record normalized error codes.
- The persistence outbox provides a recovery path.

## 16.2 Gaps

### Mastra logger query surfaces are empty

`MastraPinoLogger.listLogs()` and `listLogsByRunId()` return empty results.

That is acceptable if Kestrel intentionally owns logs elsewhere, but it means Mastra Studio’s native log navigation will not show actual logs.

### Auxiliary calls may not be represented uniformly

Potentially underrepresented or inconsistent:

- semantic routing;
- title generation;
- mutation extraction;
- guardrail detector calls;
- observational memory calls;
- embedding calls.

The architecture has telemetry types for many auxiliary activities, but the review should ensure every provider call participates in:

- cost accounting;
- trace correlation;
- failure accounting;
- retention.

### Workflow progress

Durable Full polling exposes little or no real progress. This weakens operational visibility and user feedback.

---

# 17. Tenant and authorization review

## 17.1 Strong controls

The following are consistently scoped:

- threads;
- messages;
- telemetry;
- tool telemetry;
- budgets;
- queue rows;
- mutation execution;
- audit records;
- memory backfill state.

The query layer usually includes both:

```text
userId
tenantId
```

and often joins back to the owned thread.

Database schema includes tenant columns and RLS migration support.

The worker uses an admin connection when needed and tenant partitioning when horizontally scaled.

## 17.2 Important caveat: configuration mode

RLS is conditional on environment flags:

```text
MULTI_USER_ENABLED
KESTREL_ENABLE_RLS
OSS_SINGLE_USER_MODE
```

The code fails closed for contradictory configurations, which is good.

However, self-hosted or legacy mode intentionally runs without RLS and relies on application predicates. That is acceptable only if:

- all query paths continue to use ownership predicates;
- no raw DB access bypasses them;
- worker/admin behavior is isolated.

The repository contains many direct schema queries, so this area needs continuous regression testing.

## 17.3 Worker tenant partitioning

The worker’s partitioning hashes a `tenantId` argument.

The Full-analysis claim callback passes `userId` into:

```text
ctx.tenantRouter.isMyTenant(userId)
```

The method is named and documented as tenant-based, but the caller supplies a user ID. This may be harmless in the current one-user-one-organization OSS model, but it is semantically wrong for shared organizations and can partition work incorrectly in multi-user organizations.

This is a concrete architectural defect:

- `claimNextFullAnalysisRun()` exposes an `ownsTenant?: (userId: string) => boolean`;
- the worker callback names its parameter `userId`;
- `TenantRouter.isMyTenant()` hashes the supplied value.

The function should resolve or pass the actual `tenantId`, not the user ID.

This is likely **P1 for multi-tenant scaling**, even if it does not leak data.

---

# 18. Reliability and failure analysis

## 18.1 Strong reliability behavior

The system has:

- request timeouts;
- abort propagation;
- per-tool timeouts;
- worker job timeouts;
- queue leases;
- lease heartbeats;
- stale-run recovery;
- retry classification;
- circuit breakers;
- budget recovery;
- persistence outbox;
- idempotent writes;
- no partial Full result;
- deterministic blocked states.

This is much more mature than a typical agent implementation.

## 18.2 Failure modes to address

### A. Stream completion and persistence race

The provider may finish, text may be streamed, but assistant persistence may fail.

The protocol communicates `persistence-failed`, but the UI and retry semantics should be tested end to end.

Questions to guarantee:

- Does retrying create a duplicate user message?
- Does retrying create a duplicate assistant answer?
- Is the first failed answer recoverable through the outbox?
- Does the budget reconcile exactly once?

### B. Worker lease loss after provider completion

The worker checks the lease before writing the assistant result. Good.

But if lease loss occurs after the business/model work and before terminal queue completion:

- provider spend has occurred;
- the result may be discarded;
- the budget may be reconciled or released depending on state;
- the job may be requeued.

The durable idempotency keys reduce duplication, but the exact budget and result behavior should have a dedicated lease-loss integration test at each boundary.

### C. Fire-and-forget title generation

Thread title generation is invoked with:

```text
void maybeGenerateThreadTitle(...)
```

This is non-blocking, which is good for latency, but it creates an auxiliary model call after the main turn. Its failure and budget behavior must be independently tracked.

### D. Fire-and-forget telemetry

Some Mastra tool telemetry is also fire-and-forget. Process shutdown can lose rows. The outbox may not capture errors if the process exits before the promise settles.

### E. Memory degradation

Memory failure falls back to explicit history, which is good.

But XAUUSD and canonical paths may create separate memory instances and perform repeated backfills in a single process. This is acceptable but increases latency and connection pressure.

### F. Scheduler behavior

The embedded scheduler aborts the previous job when a new tick starts, but comments say brief overlap is acceptable. For jobs with side effects, this is safe only if all writes are idempotent and lease/lock protected.

---

# 19. Security findings

## High-priority findings

### H1. Admin enforcement for system actions — resolved

The original review identified a potential bypass because registration checks did not clearly enforce `requiresAdmin` during mutation confirmation. This is now fixed.

The shared policy, workflow draft/resume/final-execution paths, and confirmation boundary enforce server-side admin authorization. Regression coverage verifies ordinary-user rejection and authorized execution, with the action and authorization decision cryptographically/contextually bound to the mutation proof.

Status: **resolved and verified**.

### H2. Fix worker partitioning to use tenant ID

The worker appears to hash `userId` where the architecture requires tenant ownership.

Severity: **P1 for multi-tenant worker correctness**.

### H3. Account semantic routing and auxiliary model calls

Semantic routing can call an LLM before the primary call. If it is not included in budget accounting, a user can consume more provider spend than the daily budget represents.

Severity: **P1 cost-control gap**.

### H4. Treat custom-instruction filtering as non-authoritative

The current regex filter is useful but brittle.

Recommended:

- preserve valid preferences instead of silently dropping them when possible;
- use explicit structured preference fields where practical;
- maintain a separate injection detector;
- add adversarial test cases with paraphrases and encoded instructions.

Severity: **P2**.

---

# 20. Data-quality and agent-safety findings

## Strong controls

The XAUUSD report pipeline is particularly strong:

- deterministic packet;
- evidence IDs;
- source timestamps;
- numeric claim verification;
- temporal checks;
- confidence checks;
- contradiction disclosure;
- bounded repair;
- no tool use during final synthesis;
- blocked state when required data is absent.

This is a good foundation for financial-domain AI.

## Remaining risks

### A. General canonical chat has weaker grounding than verified reports

Canonical chat uses read-only tools and instructions but does not appear to have the same deterministic report verifier.

Therefore, general chat can still produce unsupported narrative claims even if it uses tools.

For high-stakes financial outputs, consider:

- requiring evidence envelopes for numeric claims in canonical chat;
- adding a lightweight post-generation numeric/evidence checker;
- visually distinguishing verified reports from conversational analysis.

### B. Specialist opinions are model-generated but not independently verified

Specialist outputs have schema validation, but the committee workflow does not appear to verify every specialist claim against packet evidence with the same rigor as XAUUSD reports.

A specialist can return:

- valid bias;
- valid confidence;
- valid reasoning string;

while still making unsupported statements.

Consider deterministic checks for:

- numbers in reasoning;
- evidence IDs;
- confidence relative to packet quality;
- symbol consistency.

### C. Confidence calibration

The system validates confidence range but not calibration. A value of `0.9` is syntactically valid even if historical accuracy is poor.

The existing scorers/evaluation infrastructure can eventually measure this.

---

# 21. Test coverage review

## Existing strengths

The repository has good tests around:

- route selection;
- XAUUSD routing;
- canonical routing;
- Quick/Standard/Full mode routing;
- Full queueing;
- model overrides;
- mutation/injection rejection;
- worker claiming;
- lease loss;
- retryable worker failures;
- quota rejection;
- strict Full specialist failure;
- specialist retry;
- model resolution;
- XAUUSD context injection;
- follow-up behavior;
- RLS and tenant isolation;
- budget reservation;
- migration behavior.

This is stronger than average.

## P0 coverage added

The P0 implementation added and passed regression coverage for:

- admin-only system-action rejection and authorized execution;
- mutation token/context tampering;
- replay and concurrent confirmation behavior;
- atomic business write, audit, and execution-ledger rollback/commit behavior;
- canonical read-only tool allowlist protection against mutation exposure.

Focused verification results:

```text
AI mutation/allowlist suites: 32 passed
DB mutation execution suite: 5 passed
Web chat integration suite: 8 passed
AI, DB, and web typechecks: passed
AI and DB builds: passed
git diff --check: passed
```

## Significant remaining coverage gaps

### 1. True browser-to-server streaming integration

The route tests mock nearly every service. They do not prove:

```text
useChat
→ transport
→ SSE parser
→ stream events
→ UI message parts
→ reload persistence
```

Add an end-to-end test covering:

- streamed text;
- metadata;
- terminal status;
- provider failure;
- user abort;
- persistence failure.

### 2. Mutation browser flow

There are mutation execution tests, but the complete UI flow should be covered:

```text
user prompt
→ mutation draft
→ confirmation card
→ confirm
→ atomic business write
→ assistant confirmation
→ duplicate confirm conflict
```

Also test:

- expired token;
- wrong user;
- altered input;
- non-admin system action;
- concurrent confirmation.

### 3. Real Mastra workflow snapshots

Most workflow tests appear to mock Mastra Agent behavior.

Add tests using the actual storage adapter for:

- suspended mutation runs;
- resumed mutation runs;
- Full workflow restart;
- workflow projection;
- stale worker recovery;
- run status translation.

### 4. Memory isolation

Test that:

- user A cannot recall user B’s semantic memory;
- user A cannot see user B’s working memory;
- thread A does not backfill thread B;
- concurrent backfill does not duplicate messages;
- memory failure falls back correctly.

### 5. Tool timeout behavior

Add tests proving:

- parent abort reaches the tool;
- timeout reaches the tool;
- an ignored signal cannot block the route indefinitely;
- late tool completion does not write duplicate telemetry;
- listener cleanup occurs.

### 6. Auxiliary-call budget accounting

Test the combined cost of:

- semantic routing;
- guardrail detector;
- title generation;
- embeddings;
- specialist calls;
- fusion;
- report repair.

### 7. Tool allowlist regression

Create a policy test that fails if:

- a mutation tool enters canonical read-only tools;
- an unreviewed registry tool enters a domain;
- a plan-restricted tool is exposed to free users;
- `generic` routing accidentally bypasses read-only policy.

### 8. Prompt-injection adversarial corpus

Test paraphrases, not only exact regexes:

- role-play attacks;
- encoded instructions;
- external article injection;
- tool-result injection;
- memory poisoning;
- custom-instruction attacks.

### 9. Queue race matrix

Test every race:

- two workers claim one job;
- stale worker completes after requeue;
- lease expires during provider call;
- heartbeat fails;
- assistant persistence succeeds but queue completion fails;
- queue completion succeeds but budget reconciliation fails;
- retry sees already-persisted user/assistant messages.

---

# P1 remediation status (updated September 1, 2026)

The documented P1 implementation scope is complete:

- Full-analysis queue partitioning uses persisted tenant IDs.
- Child specialist, fusion, title, and semantic-routing costs are aggregated into the owning turn reservation where the execution path owns that reservation.
- Durable Full-analysis progress is persisted in the queue and exposed through the polling API.
- Queue claim races, lease loss, stale-worker completion, retries, workflow restart, and memory resource isolation have regression coverage.
- Relevant AI, DB, web, and worker typechecks and focused tests pass.

Browser-level production-environment validation and provider-specific detector/embedding accounting remain useful defense-in-depth release checks, but are not open blockers in the documented P1 scope.

---

# 22. Architectural risks from duplication

The largest maintainability problem is not a single unsafe function. It is duplicated policy.

## Duplicated concepts

### Model resolution

Several layers resolve or wrap models:

- `resolveChatModel`;
- `resolveMastraModel`;
- `resolveModelForProvider`;
- purpose-specific pins;
- worker snapshots;
- legacy fallback logic.

### Routing

Routing exists in:

- chat route;
- `resolveMode`;
- `autoDetectMode`;
- domain routing;
- XAUUSD routing;
- capability checks.

### Tool policy

Tool exposure is represented by:

- legacy registry;
- plan gating;
- domain tool lists;
- canonical read-only list;
- XAUUSD tool map;
- capability registry;
- active-tools lists.

### Status names

Statuses are translated across:

- queue:
  - `pending`,
  - `running`,
  - `succeeded`,
  - `failed`,
  - `cancelled`,
  - `blocked`;
- Mastra:
  - `pending`,
  - `running`,
  - `success`,
  - `failed`;
- API:
  - `pending`,
  - `running`,
  - `complete`,
  - `failed`;
- stream:
  - `persisted`,
  - `persistence-failed`,
  - `interrupted`,
  - `failed`.

### Persistence

There are two main stores:

- Drizzle business/chat persistence;
- Mastra runtime/memory/workflow storage.

This is defensible during migration, but it increases split-brain risk.

---

# 23. Recommended priorities

## P0 — before enabling mutations broadly

1. Verify and enforce `requiresAdmin` for registered system actions.
2. Add concurrent-confirmation and altered-input mutation tests.
3. Ensure mutation execution, audit, and ledger writes are atomically committed.
4. Confirm no mutation tools can enter canonical or specialist read-only agents.

## P1 — near-term reliability and cost

1. Fix worker partitioning to hash actual tenant IDs.
2. Include semantic routing and all auxiliary model calls in budget/cost accounting.
3. Add full stream integration tests.
4. Add durable workflow snapshot/restart tests.
5. Add queue race and lease-loss tests.
6. Add real memory isolation tests.
7. Expose actual durable workflow progress.

## P2 — architecture simplification

**Status: complete for the documented Mastra execution-boundary scope.** The repository now provides the canonical execution decision facade, immutable model-resolution result, capability/tool-policy facade, shared workflow status adapters, explicit persistence ownership contract, and canonical stream ordering. The remaining items below are follow-up hardening and broader migration opportunities.

1. ~~Create one canonical `ChatExecutionDecision` object containing route, capability, model purpose, and execution behavior.~~ **Complete.**
2. ~~Create one public status schema and adapters at boundaries.~~ **Complete.**
3. ~~Consolidate tool policy into one reviewable capability matrix.~~ **Complete.**
4. ~~Consolidate model resolution around one immutable resolution result.~~ **Complete.**
5. ~~Define authoritative ownership between Drizzle and Mastra with explicit projection rules.~~ **Complete.**
6. ~~Make auxiliary LLM calls first-class budget/telemetry children of the parent run.~~ **Complete for the documented execution paths.**

## P3 — quality and product

**Status: code-level implementation complete.** Evidence metadata/checking, specialist validation, structured presentation preferences, confidence-calibration helpers, clearer policy-block UX, and stream/browser contract coverage are now present. The remaining release work is operational validation rather than unimplemented P3 application logic.

1. ~~Add evidence-aware verification to general canonical chat.~~ **Complete at lightweight metadata/check level.**
2. ~~Add specialist numeric/evidence validation.~~ **Complete for deterministic packet-availability and opinion-shape checks.**
3. ~~Improve confidence calibration through evaluation data.~~ **Complete as a reusable calibration-summary helper; historical production calibration remains operational follow-up.**
4. ~~Make custom instructions structured rather than raw free text.~~ **Complete with bounded presentation-preference schema and legacy compatibility.**
5. ~~Provide a user-visible explanation when preferences or requests are blocked.~~ **Complete.**
6. ~~Standardize stream event ordering.~~ **Complete and regression-tested.**

---

# 24. Final assessment

## Overall maturity

The system is **architecturally ambitious and substantially hardened**.

It is not a simple “one prompt goes to one model” application. It includes:

- deterministic routing;
- multi-agent workflows;
- shared evidence packets;
- structured synthesis;
- report verification;
- durable queues;
- memory migration;
- tenant isolation;
- mutation approvals;
- budget accounting;
- provider resilience;
- observability correlation.

The strongest implementation principles are:

- models do not decide authorization;
- mutations are not exposed to read-only agents;
- external data is untrusted;
- required financial data failures block rather than invent;
- Full mode does not return partial committee output;
- durable workers use database leases;
- persistence is idempotent;
- budgets reserve before model execution.

## Main weakness

The main weakness is **system composition complexity**, although the documented P2 consolidation work has reduced the most important policy duplication at the Mastra boundary.

The individual components are often well designed, and the documented P0/P1/P2/P3 boundary findings are now covered by implementation and regression tests. The remaining concerns are operational validation and defense-in-depth review:

- browser-level execution against a migrated application;
- full PostgreSQL RLS/application isolation validation;
- production provider-specific accounting validation;
- independent security review;
- operational verification of configuration and RLS discipline.

## Bottom line

I would classify the current system as:

```text
Architecture: strong but over-composed
Agent safety: strong for specialized research, improved and evidence-aware for general chat
Mutation safety: strong with server-side admin enforcement and confirmation checks
Tenant isolation: strong in application paths, dependent on configuration/RLS discipline
Reliability: mature, with queue/lease/idempotency safeguards and persisted workflow progress
Observability: conceptually excellent, with auxiliary-call and progress coverage in the P1 paths
Cost control: parent/child auxiliary model costs are aggregated where the execution path owns the reservation
Test confidence: strong component and boundary coverage; browser-level production-like execution remains recommended
Production readiness: suitable for read-only research and the documented P0/P1/P2/P3 implementation scope; operational release validation remains
```
