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

// Public plugin contract — tool registrations and skills.
//
// Mastra `Skill` objects are structurally compatible with
// `PluginInlineSkill`; the AI package adapts them at the agent boundary.

import type { z } from 'zod';

import type { PluginAgentTarget, PluginExecutionContext, PluginToolAccess } from './core';

/* eslint-disable @typescript-eslint/no-explicit-any -- Plugin authoring
 * defaults must stay permissive: `any` lets a plugin register a concretely
 * typed tool in a `readonly PluginToolRegistration[]` array without
 * contravariance errors on `execute` / `toModelOutput`. The host validates
 * schemas at runtime, and each tool's own generics still constrain its
 * implementation. */
export interface PluginToolRegistration<TInput = any, TOutput = any> {
  /** Snake-case tool id exposed to the model, e.g. `run_backtest`. */
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /**
   * Optional Mastra `toModelOutput` transformer. Lets a plugin stream a large
   * chart/equity dataset to the UI while returning a compact summary to the
   * model.
   */
  toModelOutput?: (output: TOutput) => unknown;
  access: PluginToolAccess;
  /**
   * `true` always requires approval; a function is evaluated per call so a
   * paper-trading plugin can require confirmation for the Personal account
   * but run autonomously in the Agent Sandbox account.
   */
  requiresConfirmation?:
    boolean | ((input: TInput, ctx: PluginExecutionContext) => boolean | Promise<boolean>);
  /**
   * Which core agents receive this tool when the plugin is installed.
   * Defaults to `['canonical-chat']`.
   */
  attachTo?: readonly PluginAgentTarget[];
  execute: (input: TInput, ctx: PluginExecutionContext) => TOutput | Promise<TOutput>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Minimal structural shape of a Mastra inline skill. Mastra's `createSkill()`
 * output is assignable to this without importing `@mastra/core` here.
 */
export interface PluginInlineSkill {
  name: string;
  description: string;
  instructions: string;
  references?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Skills may be inline objects or filesystem paths to a `SKILL.md`
 * directory (resolved by Mastra at agent construction time).
 */
export type PluginSkillInput = string | PluginInlineSkill;

/**
 * Safe core tool metadata exposed to plugins that let users compose agents
 * (the custom-agents studio). The AI package registers it at boot; the plugin
 * never imports the core tool registry directly.
 */
export interface PluginCoreToolInfo {
  name: string;
  description: string;
  access: PluginToolAccess;
  /** Category hint for the studio picker. */
  group: 'market-data' | 'analysis' | 'research' | 'journal' | 'portfolio' | 'system' | 'other';
}
