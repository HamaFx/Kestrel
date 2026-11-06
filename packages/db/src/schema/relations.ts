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

// Drizzle Relational Queries v2 configuration.
//
// `defineRelations` is the single source of truth for `db.query.*.with(...)`.
// It is deliberately a separate module from `./index` so the schema barrel
// stays free of the relations object (the client imports both) and so plugin
// code can add its part with `defineRelationsPart` if it ever needs to.
//
// Only relations that exist as real foreign keys are `optional: false`.
// Everything else is nullable by contract.

import { defineRelations } from 'drizzle-orm';

import * as schema from './index';

export const relations = defineRelations(schema, (r) => ({
  users: {
    settings: r.one.userSettings({
      from: r.users.id,
      to: r.userSettings.userId,
    }),
    organizations: r.many.organization({
      from: r.users.id.through(r.organizationMember.userId),
      to: r.organization.id.through(r.organizationMember.orgId),
    }),
    memberships: r.many.organizationMember({
      from: r.users.id,
      to: r.organizationMember.userId,
    }),
    sessions: r.many.userSessions({
      from: r.users.id,
      to: r.userSessions.userId,
    }),
    symbols: r.many.userSymbols({
      from: r.users.id,
      to: r.userSymbols.userId,
    }),
    chatThreads: r.many.chatThreads({
      from: r.users.id,
      to: r.chatThreads.userId,
    }),
    alerts: r.many.alerts({
      from: r.users.id,
      to: r.alerts.userId,
    }),
    journalEntries: r.many.journalEntries({
      from: r.users.id,
      to: r.journalEntries.userId,
    }),
    installedPlugins: r.many.userInstalledPlugins({
      from: r.users.id,
      to: r.userInstalledPlugins.userId,
    }),
    paperAccounts: r.many.paperAccounts({
      from: r.users.id,
      to: r.paperAccounts.userId,
    }),
    backtestRuns: r.many.backtestRuns({
      from: r.users.id,
      to: r.backtestRuns.userId,
    }),
    backtestStrategies: r.many.backtestStrategies({
      from: r.users.id,
      to: r.backtestStrategies.userId,
    }),
    backtestSweeps: r.many.backtestSweeps({
      from: r.users.id,
      to: r.backtestSweeps.userId,
    }),
  },
  organization: {
    members: r.many.organizationMember({
      from: r.organization.id,
      to: r.organizationMember.orgId,
    }),
  },
  organizationMember: {
    organization: r.one.organization({
      from: r.organizationMember.orgId,
      to: r.organization.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.organizationMember.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  userSettings: {
    user: r.one.users({
      from: r.userSettings.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  userSymbols: {
    user: r.one.users({
      from: r.userSymbols.userId,
      to: r.users.id,
      optional: false,
    }),
    catalog: r.one.symbolCatalog({
      from: r.userSymbols.symbol,
      to: r.symbolCatalog.symbol,
    }),
  },
  chatThreads: {
    user: r.one.users({
      from: r.chatThreads.userId,
      to: r.users.id,
      optional: false,
    }),
    messages: r.many.chatMessages({
      from: r.chatThreads.id,
      to: r.chatMessages.threadId,
    }),
    agentOpinions: r.many.agentOpinions({
      from: r.chatThreads.id,
      to: r.agentOpinions.threadId,
    }),
    feedback: r.many.aiMessageFeedback({
      from: r.chatThreads.id,
      to: r.aiMessageFeedback.threadId,
    }),
  },
  chatMessages: {
    thread: r.one.chatThreads({
      from: r.chatMessages.threadId,
      to: r.chatThreads.id,
      optional: false,
    }),
    agentOpinions: r.many.agentOpinions({
      from: r.chatMessages.id,
      to: r.agentOpinions.messageId,
    }),
    feedback: r.many.aiMessageFeedback({
      from: r.chatMessages.id,
      to: r.aiMessageFeedback.messageId,
    }),
    briefings: r.many.briefingsEmitted({
      from: r.chatMessages.id,
      to: r.briefingsEmitted.messageId,
    }),
  },
  newsArticles: {
    embedding: r.one.newsEmbeddings({
      from: r.newsArticles.id,
      to: r.newsEmbeddings.articleId,
    }),
  },
  newsEmbeddings: {
    article: r.one.newsArticles({
      from: r.newsEmbeddings.articleId,
      to: r.newsArticles.id,
      optional: false,
    }),
  },
  paperAccounts: {
    positions: r.many.paperPositions({
      from: r.paperAccounts.id,
      to: r.paperPositions.accountId,
    }),
    orders: r.many.paperOrders({
      from: r.paperAccounts.id,
      to: r.paperOrders.accountId,
    }),
    fills: r.many.paperFills({
      from: r.paperAccounts.id,
      to: r.paperFills.accountId,
    }),
    strategyRuns: r.many.paperStrategyRuns({
      from: r.paperAccounts.id,
      to: r.paperStrategyRuns.accountId,
    }),
  },
  paperPositions: {
    account: r.one.paperAccounts({
      from: r.paperPositions.accountId,
      to: r.paperAccounts.id,
      optional: false,
    }),
  },
  paperOrders: {
    account: r.one.paperAccounts({
      from: r.paperOrders.accountId,
      to: r.paperAccounts.id,
      optional: false,
    }),
  },
  paperFills: {
    account: r.one.paperAccounts({
      from: r.paperFills.accountId,
      to: r.paperAccounts.id,
      optional: false,
    }),
  },
  paperStrategyRuns: {
    account: r.one.paperAccounts({
      from: r.paperStrategyRuns.accountId,
      to: r.paperAccounts.id,
      optional: false,
    }),
  },
  symbolCatalog: {
    watchlists: r.many.userSymbols({
      from: r.symbolCatalog.symbol,
      to: r.userSymbols.symbol,
    }),
  },
  userSessions: {
    user: r.one.users({
      from: r.userSessions.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  userInstalledPlugins: {
    user: r.one.users({
      from: r.userInstalledPlugins.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  alerts: {
    user: r.one.users({
      from: r.alerts.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  journalEntries: {
    user: r.one.users({
      from: r.journalEntries.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  agentOpinions: {
    user: r.one.users({
      from: r.agentOpinions.userId,
      to: r.users.id,
      optional: false,
    }),
    thread: r.one.chatThreads({
      from: r.agentOpinions.threadId,
      to: r.chatThreads.id,
      optional: false,
    }),
    message: r.one.chatMessages({
      from: r.agentOpinions.messageId,
      to: r.chatMessages.id,
      optional: false,
    }),
  },
  aiMessageFeedback: {
    user: r.one.users({
      from: r.aiMessageFeedback.userId,
      to: r.users.id,
      optional: false,
    }),
    reviewer: r.one.users({
      from: r.aiMessageFeedback.reviewerId,
      to: r.users.id,
    }),
    thread: r.one.chatThreads({
      from: r.aiMessageFeedback.threadId,
      to: r.chatThreads.id,
      optional: false,
    }),
    message: r.one.chatMessages({
      from: r.aiMessageFeedback.messageId,
      to: r.chatMessages.id,
      optional: false,
    }),
  },
  briefingsEmitted: {
    user: r.one.users({
      from: r.briefingsEmitted.userId,
      to: r.users.id,
      optional: false,
    }),
    message: r.one.chatMessages({
      from: r.briefingsEmitted.messageId,
      to: r.chatMessages.id,
      optional: false,
    }),
  },
  memoryEmbeddings: {
    user: r.one.users({
      from: r.memoryEmbeddings.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  providerTests: {
    user: r.one.users({
      from: r.providerTests.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  chatTelemetry: {
    user: r.one.users({
      from: r.chatTelemetry.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  chatToolTelemetry: {
    user: r.one.users({
      from: r.chatToolTelemetry.userId,
      to: r.users.id,
      optional: false,
    }),
  },
}));
