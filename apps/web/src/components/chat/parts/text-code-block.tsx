'use client';

// SPDX-License-Identifier: Apache-2.0

// Shiki-highlighted code block with copy button and optional truncation.
import { IconCheck, IconCopy } from '@tabler/icons-react';
import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCopied } from '@/hooks/use-copied';
import { cn } from '@/lib/formatters/cn';

// ── H-7: Shiki HTML sanitization ──────────────────────────────────

/**
 * Defense-in-depth sanitization of Shiki-generated HTML using DOMPurify.
 * Shiki produces only trusted <span>/<pre>/<code> elements with class and
 * style attributes, but this guard ensures any dangerous content (script
 * tags, inline event handlers, javascript: URLs) is stripped by a proper
 * HTML parser rather than regex — regex-based sanitization is known to be
 * bypassable with adversarial inputs (malformed nested tags, svg onload,
 * style url(javascript:...), etc.).
 *
 * Replaced the previous regex strip (H-1 audit fix) with DOMPurify, which
 * parses HTML into a DOM tree and removes disallowed nodes/attributes.
 * The allow-list is minimal: only the tags/attrs Shiki actually emits.
 */
export function sanitizeShikiHtml(html: string): string {
  // DOMPurify requires a DOM environment. This function is only called
  // from ShikiCode's render path after the effect sets `html` (client-
  // side only), so the SSR branch is dead in practice — kept as a
  // defensive guard in case a future caller invokes it during SSR.
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    // Shiki emits <pre class="shiki ..." style="..." tabindex="0">
    // wrapping <code> with <span style="color:..."> tokens. The
    // tabindex="0" is intentional — it makes long code blocks
    // keyboard-focusable for horizontal scrolling (CSS: overflow-x:
    // auto on .shiki). Stripping it would be an a11y regression.
    ALLOWED_TAGS: ['pre', 'code', 'span', 'br'],
    ALLOWED_ATTR: ['class', 'style', 'tabindex'],
    FORBID_ATTR: ['data-x'],
  });
}

function ShikiCode({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki');
        const normalizedLang = lang ? lang.toLowerCase() : 'text';
        const highlighted = await codeToHtml(code, {
          lang: normalizedLang,
          theme: 'github-dark-default',
        });
        if (active) {
          setHtml(highlighted);
        }
      } catch (err) {
        console.warn('[shiki-highlight] Failed to highlight code block', err);
      }
    }
    void highlight();
    return () => {
      active = false;
    };
  }, [code, lang]);

  if (html) {
    // H-7: Defense-in-depth sanitization before dangerouslySetInnerHTML.
    // Shiki produces only <span class="..."> elements and text nodes,
    // but we strip any script/iframe/event-handler patterns as a
    // safety net against potential Shiki bugs or future changes.
    const safeHtml = sanitizeShikiHtml(html);
    return <div dangerouslySetInnerHTML={{ __html: safeHtml }} className="shiki-container" />;
  }

  return (
    <pre className="scrollbar-hide text-body-sm overflow-x-auto p-3 font-mono leading-[1.4]">
      <code>{code}</code>
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Code block with copy button and optional truncation.
// ---------------------------------------------------------------------------

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, triggerCopy] = useCopied(1500);
  const [expanded, setExpanded] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code);
    triggerCopy();
  }, [code, triggerCopy]);

  const lines = useMemo(() => code.split('\n'), [code]);
  const shouldTruncate = lines.length > 100;
  const displayCode = shouldTruncate && !expanded ? lines.slice(0, 100).join('\n') : code;

  return (
    <div
      className={cn('border-border bg-bg-elev-1 relative my-2 overflow-hidden rounded-sm border')}
    >
      <div className="border-border bg-bg-elev-2 flex items-center justify-between border-b px-3 py-2">
        <span className="text-fg-subtle text-caption font-mono tracking-wider uppercase">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="text-fg-muted hover:text-fg text-caption inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 font-medium transition-colors"
        >
          {copied ? (
            <>
              <IconCheck className="text-success size-3" /> copied
            </>
          ) : (
            <>
              <IconCopy className="size-3" /> copy
            </>
          )}
        </button>
      </div>

      <ShikiCode code={displayCode} lang={lang} />

      {shouldTruncate && (
        <div className="border-border bg-bg-elev-2/50 flex justify-center border-t py-1.5">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg hover:text-fg-muted text-caption cursor-pointer font-semibold transition-colors"
          >
            {expanded ? 'Collapse code' : `Show all ${lines.length} lines`}
          </button>
        </div>
      )}
    </div>
  );
}
