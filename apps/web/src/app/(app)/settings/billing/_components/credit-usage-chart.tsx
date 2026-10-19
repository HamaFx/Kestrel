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

interface Bucket {
  date: string;
  credits: number;
}

/** Lightweight 7-day credit burn chart — no chart library dependency. */
export function CreditUsageChart({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.credits));
  return (
    <section className="border-border bg-bg-elev-1 rounded-sm border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-fg text-sm font-semibold">Credit burn · last 7 days</h3>
        <span className="text-fg-subtle font-mono text-xs">
          {buckets.reduce((sum, bucket) => sum + bucket.credits, 0).toLocaleString()} credits
        </span>
      </div>
      <div className="mt-4 flex h-24 items-end gap-2">
        {buckets.map((bucket) => {
          const height = Math.max(4, Math.round((bucket.credits / max) * 100));
          return (
            <div key={bucket.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end">
                <div
                  className="bg-brand/70 hover:bg-brand w-full rounded-t-sm transition-colors"
                  style={{ height: `${height}%` }}
                  title={`${bucket.credits} credits`}
                />
              </div>
              <span className="text-fg-subtle text-[10px]">
                {new Date(`${bucket.date}T00:00:00Z`).toLocaleDateString('en-US', {
                  weekday: 'short',
                  timeZone: 'UTC',
                })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
