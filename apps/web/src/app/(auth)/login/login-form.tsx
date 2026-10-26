'use client';

// SPDX-License-Identifier: Apache-2.0

// Login form: OAuth entry, credential + 2FA fields, and the resend/dev
// affordances. State lives in `use-login-form.ts`.
import { IconCheck, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { FormError } from '../_components/form-error';
import { OAuthButtons } from '../_components/oauth-buttons';
import { PasswordField } from '../_components/password-field';
import { ResendVerification } from './resend-verification';
import { useLoginForm } from './use-login-form';

export function LoginForm() {
  const {
    next,
    state,
    action,
    pending,
    success,
    requires2FA,
    email,
    setEmail,
    password,
    setPassword,
    showResend,
    setShowResend,
  } = useLoginForm();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-fg text-lg font-normal tracking-[-0.03em]">
        Sign in to your account
      </h2>

      <OAuthButtons
        callbackUrl={next || '/dashboard'}
        action="Sign in"
        disabled={pending || success}
      />

      <div>
        <form action={action} className="flex w-full flex-col gap-5">
          <input type="hidden" name="next" value={next} />

          {requires2FA && (
            <div className="bg-brand/10 border-brand/25 flex items-center gap-3 rounded-sm border p-3">
              <IconShieldCheck className="text-brand size-5 shrink-0" />
              <div className="flex flex-col">
                <span className="text-fg text-xs font-bold">Two-Factor Authentication</span>
                <span className="text-fg-subtle text-caption">
                  Enter the 6-digit code from your authenticator app
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-fg text-sm font-semibold">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus={!requires2FA}
              required
              disabled={success}
              readOnly={pending || requires2FA}
              aria-invalid={state?.error ? true : undefined}
              aria-describedby={state?.error ? 'form-error' : undefined}
            />
          </div>

          <PasswordField
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={success}
            readOnly={pending || requires2FA}
            error={!!state?.error}
            errorId={state?.error ? 'form-error' : undefined}
          />

          {requires2FA && (
            <div className="flex flex-col gap-2">
              <label htmlFor="totpCode" className="text-fg text-sm font-semibold">
                2FA Code
              </label>
              <Input
                id="totpCode"
                name="totpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                required
                disabled={success}
                readOnly={pending}
                placeholder="Enter 6-digit code"
              />
            </div>
          )}

          <div className="-mt-3 flex items-center justify-between">
            <label className="text-fg-muted hover:text-fg flex cursor-pointer items-center gap-2 text-xs transition-colors select-none">
              <input
                type="checkbox"
                name="rememberMe"
                value="true"
                defaultChecked
                className="accent-brand border-border focus:ring-brand size-4 cursor-pointer rounded-xs focus:ring-1"
              />
              Remember me
            </label>
            <Link
              href="/forgot-password"
              className="text-fg-muted hover:text-fg text-xs underline underline-offset-2 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <FormError message={state?.error ?? ''} />

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={pending || success}
            variant={success ? 'success' : 'primary'}
          >
            {success ? (
              <>
                <IconCheck className="size-5" /> Welcome back
              </>
            ) : pending ? (
              'Signing in…'
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-fg-subtle text-center text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-fg font-medium hover:underline">
            Create an account
          </Link>
        </p>

        {!showResend && (
          <button
            type="button"
            onClick={() => setShowResend(true)}
            className="text-fg-subtle hover:text-fg-muted cursor-pointer text-xs transition-colors"
          >
            Need to resend verification email?
          </button>
        )}
      </div>

      {/* P3-1: Resend verification email (shown on demand or verification error) */}
      {showResend && <ResendVerification defaultEmail={email} />}

      {process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true' && (
        <div className="border-border flex flex-col items-center gap-2 border-t pt-4">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/api/dev/login';
            }}
            className="text-fg-muted hover:text-fg cursor-pointer text-xs underline underline-offset-2 transition-colors"
          >
            Skip login (dev only)
          </button>
        </div>
      )}
    </div>
  );
}
