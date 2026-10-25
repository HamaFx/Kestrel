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

// The per-call `memory: { thread, resource }` shape.

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { StorageThreadType } from '@mastra/core/memory';

export interface MemoryCallOptionsArgs {
  userId: string;
  threadId: string;
  /** Optional thread title metadata (kept minimal; Kestrel owns titles). */
  title?: string;
}

/**
 * The per-call `memory` option: thread = conversation, resource = user.
 * Strict `resource = userId` prevents any cross-user leakage.
 */
export function memoryCallOptions(args: MemoryCallOptionsArgs): AgentMemoryOption {
  return {
    thread: args.title
      ? ({ id: args.threadId, title: args.title } as Partial<StorageThreadType> & {
          id: string;
        })
      : { id: args.threadId },
    resource: args.userId,
  };
}
