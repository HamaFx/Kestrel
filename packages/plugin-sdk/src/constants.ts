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

// Client-safe plugin constants.
//
// Kept out of `./settings` because that module imports server-only encryption
// helpers. The web settings form needs the mask sentinel without pulling Node
// crypto into the browser bundle.

/** Stored ciphertext marker. Prevents double-encryption on repeated saves. */
export const PLUGIN_SECRET_PREFIX = 'enc:v1:';

/** Placeholder rendered by settings UIs instead of returning plaintext. */
export const PLUGIN_SECRET_MASK = '••••••••';
