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

/**
 * Mastra's `jsonPromptInjection: 'auto'` resolves to prompt injection for any
 * model route it does not recognise, even when the provider advertises native
 * structured outputs. Prompt injection is advisory: reasoning models routinely
 * return rich JSON that misses enum values or the exact object root, and the
 * strict committee schemas reject it.
 *
 * When the provider's model has `supportsStructuredOutputs === true`, force
 * native `response_format` by returning `false`. Other providers keep the
 * existing `'auto'` fallback so their prompt-injection path is unchanged.
 */
export function jsonPromptInjectionForModel(model: unknown): false | 'auto' {
  const supports = (model as { supportsStructuredOutputs?: boolean } | null | undefined)
    ?.supportsStructuredOutputs;
  return supports === true ? false : 'auto';
}
