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
import Image from 'next/image';

import type { ComposerController } from './use-composer';

export function ComposerAttachments({ composer }: { composer: ComposerController }) {
  const { voice, images, removeImage, error } = composer;
  return (
    <>
      {voice.active ? (
        <div
          role="status"
          aria-live="polite"
          className="text-danger border-danger/30 bg-danger/10 text-body-sm mx-auto mt-1 inline-flex items-center gap-2 self-center rounded-full border px-3 py-0.5 font-medium"
        >
          <span className="bg-danger size-1.5 rounded-full motion-safe:animate-pulse" />
          Listening…
        </div>
      ) : null}

      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-2 pt-1 pb-1" aria-label="Attached images">
          {images.map((img, idx) => (
            <li key={img.id} className="relative">
              <Image
                src={img.url}
                alt={`Attached image ${idx + 1} of ${images.length}`}
                width={56}
                height={56}
                unoptimized
                className="border-border size-14 rounded-lg border object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() => removeImage(img.id)}
                className="bg-bg-elev-3 text-fg border-border focus-visible:ring-fg absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border text-xs leading-none focus:outline-none focus-visible:ring-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p id="composer-error" role="alert" className="text-danger px-2 pt-1 text-xs">
          {error}
        </p>
      ) : null}
    </>
  );
}
