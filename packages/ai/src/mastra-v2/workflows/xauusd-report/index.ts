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

// XAUUSD verified-report workflow barrel (DEC-05 split of xauusd-report.ts).
//
//   - schemas.ts    — workflow IO schemas, deps contract, output policy
//   - generation.ts — one generation attempt + deterministic classification
//   - steps.ts      — collect / generate / repair / finalize step bodies
//   - workflow.ts   — the bounded dowhile graph

export {
  XAUUSD_REPORT_OUTPUT_POLICIES,
  XauusdReportWorkflowInputSchema,
  XauusdReportWorkflowOutputSchema,
  resolveXauusdReportOutputPolicy,
  type XauusdReportOutputPolicy,
  type XauusdReportWorkflowDeps,
} from './schemas';
export { createXauusdReportWorkflow } from './workflow';
