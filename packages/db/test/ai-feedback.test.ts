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

import { describe, expect, it } from 'vitest';

import { schema } from '../src/client';

describe('AI feedback and dataset registry schema contracts', () => {
  it('exposes tenant-scoped feedback with user/message uniqueness', () => {
    expect(schema.aiMessageFeedback).toBeDefined();
    expect(schema.aiMessageFeedback.userId).toBeDefined();
    expect(schema.aiMessageFeedback.messageId).toBeDefined();
    expect(schema.aiMessageFeedback.reviewStatus).toBeDefined();
  });

  it('exposes content-addressed dataset lifecycle fields', () => {
    expect(schema.evalDatasets).toBeDefined();
    expect(schema.evalDatasets.version).toBeDefined();
    expect(schema.evalDatasets.contentSha256).toBeDefined();
    expect(schema.evalDatasets.status).toBeDefined();
    expect(schema.evalDatasets.provenance).toBeDefined();
  });
});
