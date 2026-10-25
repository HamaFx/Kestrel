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

// Auth query helpers — barrel for the split modules.
//
// Every name previously exported from `src/queries/auth.ts` is re-exported
// here so `./auth`, `../queries/auth`, `queries.auth.*` and `@kestrel/db`
// imports keep resolving unchanged.

export type { AuthUserRow, CreateUserInput } from './types';
export {
  createUserWithSettings,
  getUserByEmail,
  getTokenVersion,
  incrementFailedLogins,
  incrementTokenVersion,
  resetLoginLockout,
  updatePasswordByEmail,
  updateUserDisplayName,
  updateUserPassword,
  userExistsByEmail,
  verifyUserEmail,
} from './users';
export { createUserSession, findSession, updateSessionLastActive } from './sessions';
export {
  createVerificationToken,
  deleteVerificationToken,
  findVerificationToken,
} from './verification-tokens';
export { getTwoFactorSecret, setTwoFactorEnabled, updateTwoFactorSecret } from './two-factor';
export { updateUserApiKeys } from './api-keys';
export { deleteUserAccount } from './account-deletion';
export { createAuditLog } from './audit';
