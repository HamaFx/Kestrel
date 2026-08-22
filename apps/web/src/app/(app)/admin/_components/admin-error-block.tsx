// SPDX-License-Identifier: Apache-2.0

// <AdminErrorBlock> — shared error + retry block used across admin tabs.
// Replaces the identical `flex flex-col items-center gap-3 py-8` pattern
// that was copy-pasted into every data-table component.

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
import { Button } from '@/components/ui/button';

interface AdminErrorBlockProps {
  message: string;
  onRetry: () => void;
}

export function AdminErrorBlock({ message, onRetry }: AdminErrorBlockProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-danger text-sm">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
