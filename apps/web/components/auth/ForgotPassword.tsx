'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { KeyIcon, MailIcon } from '@/components/shell/icons';
import { requestPasswordReset } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { AuthShell } from './AuthShell';
import {
  FormError,
  FormNotice,
  PrimaryButton,
  TextField,
  validateEmail,
} from './fields';

// BL-004, first of two screens. The critical behaviour is what this screen
// must NOT do: AuthService.requestPasswordReset silently no-ops for an unknown
// address (AR-12) precisely so the response cannot be used to enumerate
// accounts, and the UI has to hold that line. The confirmation below is
// therefore phrased conditionally -- "if an account exists" -- and is shown
// on every success, never varied by whether the address was recognised,
// because this screen has no way of knowing and must not appear to.

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const emailError = validateEmail(email);
    setFieldError(emailError);
    if (emailError) {
      return;
    }

    setPending(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      setFormError(messageFor('RESET_REQUEST', error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell backHref="/login" backLabel="Back to login">
      <div className="card-raised space-y-5 p-5 text-center">
        <span
          aria-hidden
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] border-[1.5px] border-line bg-clay-wash"
        >
          <KeyIcon className="h-7 w-7 text-clay-deep" />
        </span>

        <div className="space-y-2">
          <h1 className="text-[20px] font-bold tracking-tight text-ink">
            Forgot password?
          </h1>
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>
        </div>

        <form
          noValidate
          onSubmit={onSubmit}
          data-testid="forgot-password-form"
          className="space-y-4 text-left"
        >
          <TextField
            label="Email address"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="climber@example.com"
            autoComplete="email"
            icon={<MailIcon className="h-4 w-4" />}
            error={fieldError}
          />

          <FormError message={formError} />
          <FormNotice
            message={
              sent
                ? "If an account exists for that address, a reset link is on its way. The link expires in an hour."
                : null
            }
          />

          <PrimaryButton
            testId="send-reset-link"
            pending={pending}
            label="Send reset link"
            pendingLabel="Sending…"
          />
        </form>

        <p>
          <Link
            href="/login"
            data-testid="return-to-login"
            className="text-[11px] text-ink-soft underline decoration-line-soft underline-offset-4"
          >
            Return to login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
