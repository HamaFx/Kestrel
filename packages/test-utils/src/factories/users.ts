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

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

let _userIdCounter = 0;

export function makeUser(overrides?: Partial<MockUser>): MockUser {
  _userIdCounter++;
  return {
    id: overrides?.id ?? `test-user-${_userIdCounter}`,
    name: overrides?.name ?? `Test User ${_userIdCounter}`,
    email: overrides?.email ?? `testuser${_userIdCounter}@example.com`,
    role: overrides?.role ?? 'user',
  };
}

export function makeSession(userId: string): { user: MockUser; expires: string } {
  return {
    user: {
      id: userId,
      name: 'Test User',
      email: `testuser-${userId}@example.com`,
      role: 'user',
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

export function resetUserCounter(): void {
  _userIdCounter = 0;
}
