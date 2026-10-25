'use client';

// SPDX-License-Identifier: Apache-2.0

// ReactMarkdown component overrides for assistant text rendering.
import type { Components } from 'react-markdown';

import { CodeBlock } from './text-code-block';

export const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-fg mt-4 mb-2 text-base font-bold tracking-tight sm:text-lg">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-fg mt-3 mb-1.5 text-sm font-semibold tracking-tight sm:text-base">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-brand mt-4 mb-1 text-xs font-semibold tracking-wider uppercase sm:text-sm">
      {children}
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-brand/40 bg-brand/5 text-fg-muted my-2.5 border-l-2 py-1.5 pl-3 text-xs leading-relaxed italic sm:text-sm">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-divider my-3" />,
  p: ({ children }) => (
    <p className="text-fg my-1.5 text-sm leading-relaxed whitespace-pre-line sm:text-base">
      {children}
    </p>
  ),
  ul: ({ children }) => <ul className="my-2 list-none space-y-1.5 pl-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-none space-y-1.5 pl-0">{children}</ol>,
  li: ({ children }) => (
    <li className="text-fg flex gap-2 text-sm leading-relaxed sm:text-base">
      <span className="text-fg-subtle select-none">›</span>
      <span className="flex-1">{children}</span>
    </li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-fg decoration-border hover:decoration-fg-subtle underline underline-offset-2"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="border-border/60 bg-well/40 my-3 overflow-x-auto rounded-[6px] border-[0.5px]">
      <table className="w-full table-auto text-right font-mono text-xs sm:text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-well/80 border-border/60 border-b-[0.5px]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-border/40 divide-y-[0.5px]">{children}</tbody>,
  tr: ({ children }) => <tr className="transition-colors">{children}</tr>,
  th: ({ children }) => (
    <th className="text-fg-subtle px-3 py-2 text-left font-mono font-medium tracking-wider uppercase">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="text-fg px-3 py-2 font-mono tabular-nums">{children}</td>,
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeStr = String(children).replace(/\n$/, '');
    if (!match) {
      return (
        <code
          className="bg-bg-elev-2 text-fg-muted border-border rounded-sm border px-1.5 py-0.5 font-mono text-xs sm:text-sm"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <CodeBlock lang={match[1]!} code={codeStr} />;
  },
};
