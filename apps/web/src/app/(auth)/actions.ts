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

// Authentication server actions — re-export barrel.
// Implementations live in sibling `_actions-*.ts` files, each marked with
// the "use server" directive. Import paths such as `from '../actions'`
// and `from '@/app/(auth)/actions'` keep resolving to this module.

export type { AuthActionState } from './_actions-shared';

export { loginAction, sanitizeNext } from './_actions-login';
export { registerAction } from './_actions-register';
export { forgotPasswordAction, resetPasswordAction } from './_actions-password-reset';
export { resendVerificationAction } from './_actions-verification';
