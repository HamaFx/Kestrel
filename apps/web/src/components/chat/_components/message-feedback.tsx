'use client';

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
import { IconCheck, IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { apiMutate } from '@/lib/api-client';

interface MessageFeedbackProps {
  threadId: string;
  messageId: string;
}

type Rating = 'positive' | 'negative';

export function MessageFeedback({ threadId, messageId }: MessageFeedbackProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [pending, setPending] = useState<Rating | null>(null);

  async function submit(nextRating: Rating) {
    setPending(nextRating);
    try {
      await apiMutate(
        `/api/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/feedback`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rating: nextRating }),
        },
      );
      setRating(nextRating);
      toast.success(
        nextRating === 'positive'
          ? 'Thanks for the feedback'
          : 'Thanks — we will review this response',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save feedback');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1" aria-label="Rate this response">
      <button
        type="button"
        aria-label="Good response"
        aria-pressed={rating === 'positive'}
        disabled={pending !== null}
        onClick={() => void submit('positive')}
        className="text-fg-subtle hover:text-success focus-visible:ring-fg inline-flex size-8 items-center justify-center rounded-sm transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
      >
        {rating === 'positive' ? (
          <IconCheck className="size-3.5" aria-hidden="true" />
        ) : (
          <IconThumbUp className="size-3.5" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        aria-label="Poor response"
        aria-pressed={rating === 'negative'}
        disabled={pending !== null}
        onClick={() => void submit('negative')}
        className="text-fg-subtle hover:text-danger focus-visible:ring-fg inline-flex size-8 items-center justify-center rounded-sm transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
      >
        {rating === 'negative' ? (
          <IconCheck className="size-3.5" aria-hidden="true" />
        ) : (
          <IconThumbDown className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
