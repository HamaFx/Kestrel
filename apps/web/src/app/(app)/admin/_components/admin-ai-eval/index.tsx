'use client';

// SPDX-License-Identifier: Apache-2.0

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

// AI eval sweep shell: runs the read-only XAUUSD prompt set through the chat
// route and renders the toolbar plus per-prompt results.
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AI_EVAL_PROMPTS } from '@/lib/services/ai-eval-prompts';

import { EvalIdleHint } from './eval-idle-hint';
import { EvalResultsTable } from './eval-results-table';
import { EvalToolbar } from './eval-toolbar';
import { useEvalRun } from './use-eval-run';

export function AdminAiEval() {
  const { rows, running, summary, completed, run, stop, reset } = useEvalRun();

  return (
    <SettingsSection
      title="AI Eval — XAUUSD comparison run"
      description={`Runs ${AI_EVAL_PROMPTS.length} read-only gold prompts through the normal chat route from your session. Each eligible prompt produces a Mastra verified report. This uses provider tokens and takes roughly 10–20 minutes.`}
    >
      <EvalToolbar
        running={running}
        summary={summary}
        completed={completed}
        onRun={() => void run()}
        onStop={stop}
        onReset={reset}
      />

      {completed > 0 || running ? <EvalResultsTable rows={rows} /> : <EvalIdleHint />}
    </SettingsSection>
  );
}
