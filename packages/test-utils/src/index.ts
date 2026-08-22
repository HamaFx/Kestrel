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

export { makeCandles, type MakeCandlesOpts } from './factories/candles';
export { makeUser, makeSession, type MockUser } from './factories/users';
export {
  makeThread,
  makeMessage,
  resetThreadCounter,
  type MockThread,
  type MockMessage,
} from './factories/threads';
export { createMockLlm, type MockLlmResponse } from './mocks/llm';
export { createTestDb, type TestDbHandle } from './mocks/db';
export { createMockFetch, type MockFetchHandler } from './mocks/fetch';
export { setupTestEnvironment, installServerOnlyStub } from './helpers/vitest';
export { createProjectConfig } from './helpers/vitest-base';
