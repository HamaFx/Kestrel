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
import type { ToolName } from '@kestrel/shared';
import { IconPower } from '@tabler/icons-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { updateDisabledToolsAction } from '../../actions';

interface DisabledToolsFormProps {
  allTools: ToolName[];
  initialDisabledTools: string[];
}

export function DisabledToolsForm({ allTools, initialDisabledTools }: DisabledToolsFormProps) {
  type FormState = { ok: boolean; error?: string };
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const disabled = formData.getAll('disabledTool') as string[];
      const res = await updateDisabledToolsAction(disabled);
      return res.ok ? { ok: true } : { ok: false, error: res.error || 'Unknown error' };
    },
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Disabled tools updated successfully');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="border-border bg-bg-elev-1 overflow-hidden rounded-sm border">
        {allTools.map((toolName) => {
          const isDisabled = initialDisabledTools.includes(toolName);
          return (
            <label
              key={toolName}
              className="border-border hover:bg-bg-elev-2/20 flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 transition-colors select-none last:border-b-0"
            >
              <input
                type="checkbox"
                name="disabledTool"
                value={toolName}
                defaultChecked={isDisabled}
                className="accent-brand border-border size-4 cursor-pointer rounded-sm"
              />
              <IconPower
                className={`size-3.5 shrink-0 ${isDisabled ? 'text-danger' : 'text-success'}`}
              />
              <div className="flex min-w-0 flex-col">
                <code className="text-fg font-mono text-xs font-semibold">{toolName}</code>
              </div>
              <span className="text-fg-subtle ml-auto text-xs font-medium tracking-wider uppercase">
                {isDisabled ? 'Disabled' : 'Enabled'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} className="min-w-[120px]">
          Save Changes
        </Button>
      </div>
    </form>
  );
}
