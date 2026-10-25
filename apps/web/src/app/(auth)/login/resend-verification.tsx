'use client';

// SPDX-License-Identifier: Apache-2.0

// P3-1: Inline resend-verification trigger with smart prefill.
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { FormError } from '../_components/form-error';
import { resendVerificationAction } from '../actions';

export function ResendVerification({ defaultEmail }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultEmail && !email) {
      setEmail(defaultEmail);
    }
  }, [defaultEmail, email]);

  async function handleResend() {
    if (!email || !email.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    setLoading(true);
    setError('');
    const result = await resendVerificationAction(email);
    if ('error' in result && result.error) setError(result.error);
    else setSent(true);
    setLoading(false);
  }

  return (
    <div className="border-border flex flex-col gap-2 border-t pt-4">
      <p className="text-fg-subtle text-center text-xs">
        Didn&apos;t receive a verification email?
      </p>
      {!sent ? (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            className="h-10 flex-1 text-[16px] sm:text-sm"
            aria-label="Email for verification resend"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={loading}
            disabled={loading}
            onClick={handleResend}
          >
            Resend
          </Button>
        </div>
      ) : (
        <p className="text-success text-center text-xs" role="status">
          Verification email sent — check your inbox.
        </p>
      )}
      {error && <FormError id="resend-error" message={error} />}
    </div>
  );
}
