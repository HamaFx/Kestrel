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

// Labelled field wrapper for the new-run form.
import { PLUGIN_UI_CLASSES } from '../format';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label data-slot="field" className="flex flex-col gap-1.5">
      <span data-slot="field-label" className={PLUGIN_UI_CLASSES.fieldLabel}>
        {label}
      </span>
      {children}
      {hint ? (
        <span data-slot="field-description" className="text-fg-subtle text-[11px]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
