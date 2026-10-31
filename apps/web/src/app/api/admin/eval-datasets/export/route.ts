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

// Manual (admin-triggered) training-dataset export.
//
// Decision 3A — this handler writes the same artifacts as the nightly worker
// job: `dataset.jsonl`, `manifest.json`, and the Jev `jev-rlcd.jsonl`
// companion, with feedback pairs enriched by the real tool names joined from
// `chat_tool_telemetry`. File writes are best-effort on serverless/read-only
// filesystems; the content-addressed `eval_datasets` registration is the
// source of truth.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { withAdminAuth } from '@/lib/auth/admin-auth';
import { errorResponse } from '@/lib/http/api';
import { recordAdminAudit } from '@/lib/services/admin';
import {
  assembleTrainingDataset,
  buildJevRlcdTrainingRecords,
  isRlcdStateSafe,
  listReviewedTrainingPairs,
  publishTrainingDatasetToLangfuse,
  registerEvalDataset,
  resolveEvaluationAnnotations,
  type FeedbackAnnotationInput,
  type PromptResult,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function utcStamp(d: Date): string {
  // manual-2026-08-17-22-45 — safe for version regex + filenames.
  return d.toISOString().slice(0, 16).replace(/[-:]/g, '-').replace('T', '-');
}

export const POST = withAdminAuth(async (req, { user }) => {
  try {
    const pairs = await listReviewedTrainingPairs({ limit: 500 });

    // Feedback rows become results whose annotation comes from the reviewer
    // label (resolution priority 1 — the resolver keys by message id).
    const feedbackByMessageId = new Map<string, FeedbackAnnotationInput>();
    for (const pair of pairs) {
      feedbackByMessageId.set(pair.messageId, {
        rating: pair.rating,
        reviewStatus: 'reviewed',
        reviewerLabel: pair.reviewerLabel,
        issueCodes: pair.issueCodes,
        reviewerNote: pair.reviewerNote,
        userNote: pair.userNote,
      });
    }
    const results: PromptResult[] = pairs.map((pair) => ({
      id: pair.messageId,
      prompt: pair.prompt,
      ttftMs: null,
      totalMs: 0,
      text: pair.assistantText,
      // Decision 3A — the tools the turn actually invoked, joined from
      // chat_tool_telemetry, so both JSONL files carry the real tool surface.
      toolCalls: (pair.toolNames ?? []).map((name) => ({
        name,
        args: {},
        resultSummary: null,
      })),
      agentProgress: [],
      metadata: {},
      terminalStatus: null,
      ok: true,
    }));

    // Keep only reviewer-approved records; the assembler refuses needs_review.
    const annotations = resolveEvaluationAnnotations({ results, feedbackByMessageId });
    const approved = results.filter((result) => {
      const label = annotations[result.id]?.label;
      return label === 'pass' || label === 'fail';
    });

    if (approved.length === 0) {
      return Response.json(
        {
          error: {
            code: 'NO_APPROVED_RECORDS',
            message: 'No reviewer-approved feedback to export yet',
          },
        },
        { status: 409 },
      );
    }

    const version = `manual-${utcStamp(new Date())}`;

    // Decision 3A — build the Jev RLCD companion alongside the eval dataset.
    // Enabled by default; a single prompt tripping the PII/credential guard
    // is skipped rather than aborting the whole export.
    const rlcdEnabled = (process.env.RLCD_EXPORT_ENABLED ?? 'true') !== 'false';
    const rlcd = rlcdEnabled
      ? buildJevRlcdTrainingRecords(
          approved.filter((result) => isRlcdStateSafe(result.prompt)),
          { datasetVersion: version, annotations },
        )
      : [];

    const assembled = assembleTrainingDataset({
      results: approved,
      feedbackByMessageId,
      datasetVersion: version,
      requireApprovedAnnotations: true,
      // Privacy posture: hashes only; raw text exports need explicit approval.
      source: 'admin:manual-export',
      provenance: {
        generator: 'kestrel.admin.manual-export',
        feedbackPairs: pairs.length,
        approvedRecords: approved.length,
        droppedNeedsReview: results.length - approved.length,
        rlcdRecords: rlcd.length,
      },
    });

    const row = await registerEvalDataset({
      version,
      contentSha256: assembled.manifest.contentSha256,
      recordCount: assembled.manifest.recordCount,
      source: assembled.manifest.source,
      provenance: assembled.manifest.provenance,
      createdBy: user.userId,
    });
    if (!row) {
      return Response.json(
        { error: { code: 'CONFLICT', message: 'A dataset with this version already exists' } },
        { status: 409 },
      );
    }

    // Best-effort file writes: serverless hosts can present a read-only
    // filesystem, and the DB registration above is the durable artifact.
    let outputDir: string | null = null;
    try {
      const outDir = join(process.env.DATASETS_DIR ?? '/tmp/kestrel-datasets', version);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'dataset.jsonl'), assembled.jsonlContent, 'utf8');
      await writeFile(
        join(outDir, 'manifest.json'),
        `${JSON.stringify(assembled.manifest, null, 2)}\n`,
        'utf8',
      );
      if (rlcd.length > 0) {
        await writeFile(
          join(outDir, 'jev-rlcd.jsonl'),
          `${rlcd.map((record) => JSON.stringify(record)).join('\n')}\n`,
          'utf8',
        );
      }
      outputDir = outDir;
    } catch {
      // Read-only filesystem — keep the registered dataset.
    }

    // Best-effort Langfuse publish (disabled without LANGFUSE_* env).
    try {
      await publishTrainingDatasetToLangfuse(assembled, {
        datasetName: 'kestrel-training',
        description: `Governed eval training records — ${version}`,
      });
    } catch {
      // Publishing is a replica; the registered dataset stays authoritative.
    }

    await recordAdminAudit(user.userId, 'ai.dataset.export', undefined, {
      version: row.version,
      recordCount: row.recordCount,
      contentSha256: row.contentSha256,
    });

    return Response.json(
      {
        dataset: row,
        droppedNeedsReview: results.length - approved.length,
        rlcdRecordCount: rlcd.length,
        outputDir,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, req);
  }
});
