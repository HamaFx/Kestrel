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
import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { FormError } from '../_components/form-error';
import { forgotPasswordAction } from '../actions';

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, { error: '' });

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex w-full flex-col gap-5">
        <p className="text-fg-muted text-sm">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-fg text-sm font-semibold">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            disabled={pending || !!state?.success}
          />
        </div>

        <FormError message={state?.error ?? ''} />

        {state?.success && (
          <p className="text-success text-sm" role="status">
            {state.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={pending || !!state?.success}
          variant={state?.success ? 'success' : 'primary'}
        >
          {state?.success ? 'Email sent' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-fg-subtle text-center text-sm">
        Remember your password?{' '}
        <Link href="/login" className="text-fg font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
