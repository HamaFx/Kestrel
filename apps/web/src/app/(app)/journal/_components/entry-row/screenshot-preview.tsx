'use client';

// SPDX-License-Identifier: Apache-2.0

// Clickable chart-screenshot thumbnail that opens the full image in a new tab.
import Image from 'next/image';

import { resolveChatImageSrc } from '@/lib/http/chat-image-paths';

export function ScreenshotPreview({ url }: { url: string }) {
  // R7: chat-image uploads are served by the owner-checked proxy. Legacy rows
  // still store the old world-readable Supabase URL, which the resolver maps
  // to the proxy path so they keep rendering.
  const src = resolveChatImageSrc(url);
  return (
    <button type="button" onClick={() => window.open(src, '_blank')} className="mt-1.5 inline-flex">
      <Image
        src={src}
        alt="Trade chart screenshot"
        width={48}
        height={48}
        className="size-12 rounded-lg border border-white/10 object-cover transition-opacity hover:opacity-80"
        unoptimized
      />
    </button>
  );
}
