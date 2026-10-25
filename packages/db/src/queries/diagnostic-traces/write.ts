/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Diagnostic trace writes. Retention purges live in the retention sweep, not
// here — this module only appends trace rows.

import { getDb, schema } from '../../client';
import type { DiagnosticTraceInsert } from './types';

export async function insertDiagnosticTrace(row: DiagnosticTraceInsert): Promise<void> {
  const db = getDb();
  await db.insert(schema.diagnosticTraces).values(row);
}
