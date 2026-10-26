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

// /chat — landing route.
//
// Behaviour:
//   - With ?prompt=… → always create a fresh thread and forward the
//     prompt as a query param so the chat surface auto-sends it once
//     the page mounts. Used by "Ask AI" affordances elsewhere
//     (article cards, calendar events, chart toolbar) to drop the user
//     straight into a conversation about the thing they tapped.
//   - Otherwise → redirect to the most recently used thread, or create
//     a fresh one if none exist.

import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { createThread, listThreads } from '@/lib/services/api-boundary';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    prompt?: string;
    new?: string;
    agent?: string;
    mode?: string;
    desk?: string;
  }>;
}

export default async function ChatLanding({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect('/login');

  const { prompt, new: forceNew, agent, mode, desk } = await searchParams;

  const params = new URLSearchParams();
  if (prompt && prompt.trim().length > 0) params.set('prompt', prompt);
  if (agent) params.set('agent', agent);
  if (mode) params.set('mode', mode);
  if (desk) params.set('desk', desk);
  const queryString = params.toString() ? `?${params.toString()}` : '';

  if ((prompt && prompt.trim().length > 0) || mode || desk || forceNew === '1') {
    const fresh = await createThread(userId);
    redirect(`/chat/${fresh.id}${queryString}`);
  }

  const { threads } = await listThreads(userId, 1);
  const target = threads[0] ?? (await createThread(userId));
  redirect(`/chat/${target.id}${queryString}`);
}
