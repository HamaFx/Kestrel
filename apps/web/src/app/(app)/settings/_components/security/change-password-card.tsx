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
import { IconCheck, IconEye, IconEyeOff, IconLock, IconX } from '@tabler/icons-react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input, InputAddon, InputGroup } from '@/components/ui/input';
import { OtpInput } from '@/components/ui/otp-input';

import { changePasswordAction } from '../../actions';

type FormState = { ok: boolean; error: string };

export function ChangePasswordCard() {
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // key forces form remount on success → clears all uncontrolled inputs
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const currentPassword = formData.get('currentPassword') as string;
      const newPw = formData.get('newPassword') as string;
      const totpCode = (formData.get('totpCode') as string) || undefined;

      if (!currentPassword || !newPw) {
        return { ok: false, error: 'Both password fields are required' };
      }

      const res = await changePasswordAction(currentPassword, newPw, totpCode);
      return {
        ok: res.ok,
        error: 'error' in res ? (res.error ?? '') : '',
      };
    },
    { ok: false, error: '' },
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Password changed');
      setNewPassword('');
      setFormKey((k) => k + 1); // remount form to clear all inputs
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center gap-2 border-b border-white/5 pb-1">
        <IconLock className="text-brand size-4.5" />
        <h3 className="text-fg text-base font-semibold tracking-tight">Change Password</h3>
      </div>

      {state.ok ? (
        <div className="text-success flex items-center gap-2 text-sm">
          <IconCheck className="size-4" />
          Password changed successfully
        </div>
      ) : (
        <form key={formKey} action={action} className="flex flex-col gap-3">
          <InputGroup>
            <Input
              name="currentPassword"
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Current password"
              required
              disabled={pending}
            />
            <InputAddon>
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="text-fg-muted hover:text-fg inline-flex size-8 items-center justify-center rounded-sm transition-colors"
                tabIndex={-1}
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </InputAddon>
          </InputGroup>
          <InputGroup>
            <Input
              name="newPassword"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              disabled={pending}
            />
            <InputAddon>
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="text-fg-muted hover:text-fg inline-flex size-8 items-center justify-center rounded-sm transition-colors"
                tabIndex={-1}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
              >
                {showNew ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </InputAddon>
          </InputGroup>
          {newPassword.length > 0 && (
            <div className="text-fg-subtle grid grid-cols-2 gap-1 text-xs">
              <span
                className={`inline-flex items-center gap-1 ${newPassword.length >= 8 ? 'text-success' : 'text-danger'}`}
              >
                {newPassword.length >= 8 ? (
                  <IconCheck className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <IconX className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                Min 8 characters
              </span>
              <span
                className={`inline-flex items-center gap-1 ${/[A-Z]/.test(newPassword) ? 'text-success' : 'text-danger'}`}
              >
                {/[A-Z]/.test(newPassword) ? (
                  <IconCheck className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <IconX className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                Uppercase
              </span>
              <span
                className={`inline-flex items-center gap-1 ${/[a-z]/.test(newPassword) ? 'text-success' : 'text-danger'}`}
              >
                {/[a-z]/.test(newPassword) ? (
                  <IconCheck className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <IconX className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                Lowercase
              </span>
              <span
                className={`inline-flex items-center gap-1 ${/[0-9]/.test(newPassword) ? 'text-success' : 'text-danger'}`}
              >
                {/[0-9]/.test(newPassword) ? (
                  <IconCheck className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <IconX className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                Number
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
              2FA code (if enabled)
            </span>
            <OtpInput name="totpCode" disabled={pending} aria-label="2FA code (if enabled)" />
          </div>
          <Button type="submit" size="sm" loading={pending} disabled={pending}>
            Change password
          </Button>
        </form>
      )}
    </div>
  );
}
