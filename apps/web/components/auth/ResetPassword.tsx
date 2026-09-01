'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { confirmPasswordReset } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { AuthShell } from './AuthShell';
import {
  FormError,
  FormNotice,
  PasswordField,
  PrimaryButton,
  validatePassword,
} from './fields';

// BL-004, second of two screens. The token arrives in the URL because that is
// the shape AuthService builds the emailed link with:
// `${APP_BASE_URL}/reset-password?token=<rawToken>` (AR-12). This route's
// path is therefore a contract with the API's mail template -- renaming it
// silently breaks every reset email already in someone's inbox.
//
// The token is never echoed into the DOM. It is a single-use credential, and
// putting it in a hidden input or a data attribute would leak it to anything
// that can read the page.

export function ResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  // A visitor who typed the path by hand, or whose mail client mangled the
  // link. Failing here is kinder than letting them choose a password and only
  // then discovering there is nothing to apply it to.
  if (!token) {
    return (
      <AuthShell backHref="/login" backLabel="Back to login">
        <div className="card-raised space-y-4 p-5 text-center">
          <h1 className="text-[19px] font-bold tracking-tight text-ink">
            Reset link incomplete
          </h1>
          <p
            data-testid="reset-missing-token"
            className="text-[12px] leading-relaxed text-ink-soft"
          >
            This page needs the link from your reset email. Open that link
            directly, or request a new one.
          </p>
          <Link
            href="/forgot-password"
            data-testid="request-new-link"
            className="label-caps block rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-3 text-[11.5px] text-paper"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    const passwordError = validatePassword(password);
    if (passwordError) {
      errors.newPassword = passwordError;
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = 'Both passwords must match.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setPending(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
      // Committing a new hash also nulls the session columns server-side
      // (AR-12), so whatever cookie this browser held is already dead. Send
      // them to login rather than anywhere that would 401 on arrival.
      setTimeout(() => router.replace('/login'), 1500);
    } catch (error) {
      setFormError(messageFor('RESET_CONFIRM', error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell backHref="/login" backLabel="Back to login">
      <div className="card-raised space-y-5 p-5">
        <div className="space-y-2 text-center">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">
            Choose a new password
          </h1>
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Once you set it, you&apos;ll be signed out everywhere and can log
            in again.
          </p>
        </div>

        <form
          noValidate
          onSubmit={onSubmit}
          data-testid="reset-password-form"
          className="space-y-4"
        >
          <PasswordField
            label="New password"
            name="newPassword"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint="At least 8 characters."
            error={fieldErrors.newPassword}
          />
          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />

          <FormError message={formError} />
          <FormNotice
            message={done ? 'Password updated. Taking you to login…' : null}
          />

          <PrimaryButton
            testId="reset-password-submit"
            pending={pending}
            disabled={done}
            label="Set new password"
            pendingLabel="Saving…"
          />
        </form>
      </div>
    </AuthShell>
  );
}
