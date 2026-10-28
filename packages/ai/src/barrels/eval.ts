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

// Eval sub-barrel: training exports, dataset assembly, annotation resolution,
// offline eval runners and metrics, Langfuse publishing, and the UI
// message-stream parser. Re-exported by `src/index.ts`.

export {
  buildTrainingRecords,
  buildJevRlcdTrainingRecords,
  buildDatasetManifest,
  writeTrainingExport,
  TRAINING_RECORD_SCHEMA,
  DATASET_MANIFEST_SCHEMA,
  JEV_RLCD_RECORD_SCHEMA,
  type EvaluationAnnotation,
  type EvaluationLabel,
  type JevRlcdTrainingRecord,
  type TrainingExportOptions,
  type TrainingExportRecord,
  type DatasetManifest,
} from '../eval/training-export';
export {
  assembleTrainingDataset,
  writeAssembledDataset,
  type AssembleDatasetInput,
  type AssembledDataset,
} from '../eval/assemble-dataset';
export {
  resolveEvaluationAnnotations,
  type ResolveAnnotationsInput,
  type FeedbackAnnotationInput,
} from '../eval/annotation-resolver';
export type { PromptResult, PromptDef, RunEvalsResult, EvaluationScore } from '../eval/runner';
export { computeDrift, type DriftReport, type DriftBucket } from '../eval/drift';
export { emitEvalMetrics, isEvalCaseOk } from '../eval/eval-metrics';
export {
  publishTrainingDatasetToLangfuse,
  createLangfuseClientFromEnv,
  LangfuseSdkClient,
  recordToDatasetItem,
  stableDatasetItemId,
  type LangfuseDatasetClient,
  type LangfusePublishOptions,
  type LangfusePublishResult,
} from '../eval/langfuse-publisher';
export {
  consumeUIMessageStream,
  type ParsedStreamResult,
  type ParsedToolCall,
  type ParsedStreamMetadata,
  type AgentProgressSnapshot,
} from '../eval/parse-stream';
