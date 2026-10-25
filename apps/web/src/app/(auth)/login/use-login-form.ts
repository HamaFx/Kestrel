'use client';

// SPDX-License-Identifier: Apache-2.0

// Login form state: server-action wiring plus the derived 2FA / success /
// resend-verification flags.
import { useSearchParams } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { loginAction } from '../actions';

export function useLoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '';

  const [state, action, pending] = useActionState(loginAction, { error: '' });
  const [success, setSuccess] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    if (state.requires2FA) setRequires2FA(true);
    if (state.success) setSuccess(true);
    if (state.error && state.error.toLowerCase().includes('verif')) {
      setShowResend(true);
    }
  }, [state.requires2FA, state.success, state.error]);

  return {
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
  };
}

export type LoginFormController = ReturnType<typeof useLoginForm>;
