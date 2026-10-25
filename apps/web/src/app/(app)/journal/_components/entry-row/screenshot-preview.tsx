'use client';

// SPDX-License-Identifier: Apache-2.0

// Clickable chart-screenshot thumbnail that opens the full image in a new tab.
import Image from 'next/image';

export function ScreenshotPreview({ url }: { url: string }) {
  return (
    <button type="button" onClick={() => window.open(url, '_blank')} className="mt-1.5 inline-flex">
      <Image
        src={url}
        alt="Trade chart screenshot"
        width={48}
        height={48}
        className="size-12 rounded-lg border border-white/10 object-cover transition-opacity hover:opacity-80"
        unoptimized
      />
    </button>
  );
}
