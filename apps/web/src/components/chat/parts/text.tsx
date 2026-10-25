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

// Assistant/user text part. Markdown overrides live in `text-markdown.tsx`;
// the Shiki code block and its sanitizer live in `text-code-block.tsx`.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MARKDOWN_COMPONENTS } from './text-markdown';

export { sanitizeShikiHtml } from './text-code-block';

interface TextPartProps {
  text: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
}

export function TextPart({ text, role, isStreaming }: TextPartProps) {
  // User bubbles never need markdown formatting — the user typed it
  // verbatim and we should render it the same way they typed it.
  if (role === 'user') {
    return <p className="text-sm leading-relaxed whitespace-pre-line sm:text-base">{text}</p>;
  }

  // While streaming, skip expensive ReactMarkdown + Shiki parsing.
  // Upgrade to full markdown rendering once streaming finishes.
  // `whitespace-pre-line` keeps the model's paragraph breaks visible so
  // the layout doesn't jump when the finished markdown render swaps in.
  if (isStreaming) {
    return (
      <div className="md-prose text-fg space-y-2 text-sm leading-relaxed tracking-normal whitespace-pre-line sm:text-base">
        {text}
        <span
          aria-hidden="true"
          className="bg-fg ml-[1px] inline-block h-[1em] w-[2px] animate-pulse align-middle"
        />
      </div>
    );
  }

  return (
    <div className="md-prose text-fg space-y-2 text-sm leading-relaxed tracking-normal sm:text-base">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
