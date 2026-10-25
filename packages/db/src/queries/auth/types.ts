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

// Auth query row shapes shared by the login, registration and 2FA helpers.

export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  hashedPassword: string | null;
  tokenVersion: number;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  emailVerified: Date | null;
}

/** Input for creating a new user + userSettings in a transaction. */
export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  hashedPassword: string;
}
