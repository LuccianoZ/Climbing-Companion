'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { MailIcon } from '@/components/shell/icons';
import { messageFor } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { AuthBrand, AuthShell } from './AuthShell';
import {
  FormError,
  PasswordField,
  PrimaryButton,
  TextField,
  validateEmail,
  validatePassword,
} from './fields';

// BL-001 / BL-002. AR-23: /login and /register are two routes over this one
// component, because the mockup draws them as a single card with a segmented
// Login/Register switch -- not two visually distinct screens. Two routes so
// each is linkable and the browser's back button behaves; one component so
// the switch is a real toggle rather than a navigation that repaints the card.

export type AuthMode = 'login' | 'register';

// Where to land after signing in. Defaults to the map. A ?next= is honoured
// only when it is a path on this origin -- an absolute URL here would make the
// login screen an open redirect, which is worth refusing even in an MVP.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/';
  }
  return raw;
}

export function AuthGateway({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const { signIn, signUp } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const registering = mode === 'register';

  function validate(): boolean {
    const errors: Record<string, string> = {};

    const emailError = validateEmail(email);
    if (emailError) {
      errors.email = emailError;
    }

    // Login does not re-check the password policy: the server only ever
    // compares against a stored hash, and telling someone their existing
    // password is "too short" at the login screen would be both wrong and
    // alarming. Registration does check, mirroring RegisterDto exactly.
    if (registering) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        errors.password = passwordError;
      }
      if (confirmPassword !== password) {
        errors.confirmPassword = 'Both passwords must match.';
      }
      if (!displayName.trim()) {
        errors.displayName = 'Choose a display name.';
      }
    } else if (!password) {
      errors.password = 'Enter your password.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) {
      return;
    }

    setPending(true);
    try {
      if (registering) {
        await signUp(email.trim(), password, displayName.trim());
      } else {
        await signIn(email.trim(), password);
      }
      router.replace(next);
    } catch (error) {
      setFormError(messageFor(registering ? 'REGISTER' : 'LOGIN', error));
    } finally {
      setPending(false);
    }
  }

  const switchQuery = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell>
      <AuthBrand />

      <form
        noValidate
        onSubmit={onSubmit}
        data-testid="auth-form"
        data-auth-mode={mode}
        className="card-raised space-y-4 p-4"
      >
        <div
          role="tablist"
          aria-label="Login or register"
          className="flex rounded-full border-[1.5px] border-line bg-paper p-1"
        >
          <ModeTab
            href={`/login${switchQuery}`}
            label="Login"
            testId="mode-login"
            active={!registering}
          />
          <ModeTab
            href={`/register${switchQuery}`}
            label="Register"
            testId="mode-register"
            active={registering}
          />
        </div>

        <TextField
          label="Email address"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="climber@example.com"
          autoComplete="email"
          icon={<MailIcon className="h-4 w-4" />}
          error={fieldErrors.email}
        />

        {/* AR-23: the mockup's register card shows only email and password,
            but RegisterDto requires displayName (varchar(50), NOT NULL) --
            there is no server-side default to fall back on, so the field is
            added rather than the column being made to guess. */}
        {registering ? (
          <TextField
            label="Display name"
            name="displayName"
            value={displayName}
            onChange={setDisplayName}
            placeholder="How other climbers see you"
            autoComplete="nickname"
            maxLength={50}
            error={fieldErrors.displayName}
          />
        ) : null}

        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={setPassword}
          autoComplete={registering ? 'new-password' : 'current-password'}
          hint={registering ? 'At least 8 characters.' : undefined}
          error={fieldErrors.password}
        />

        {registering ? (
          <PasswordField
            label="Confirm password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />
        ) : null}

        <FormError message={formError} />

        <PrimaryButton
          testId="auth-submit"
          pending={pending}
          label={registering ? 'Create account' : 'Login to send'}
          pendingLabel={registering ? 'Creating account…' : 'Logging in…'}
        />

        {!registering ? (
          <p className="text-center">
            <Link
              href="/forgot-password"
              data-testid="forgot-password-link"
              className="text-[11px] text-ink-soft underline decoration-line-soft underline-offset-4"
            >
              Forgot your chalk bag? (Reset password)
            </Link>
          </p>
        ) : null}
      </form>

      {/* The mockup's "OR CLIMB WITH — Google / Apple" row is deliberately not
          rendered. There is no OAuth provider on the API (AuthController has
          register/login/logout/reset and nothing else) and no backlog item
          for one, so those buttons could only ever fail. Recorded as AR-34
          rather than left as a silent omission from an approved design. */}
    </AuthShell>
  );
}

function ModeTab({
  href,
  label,
  testId,
  active,
}: {
  href: string;
  label: string;
  testId: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      data-testid={testId}
      replace
      className={[
        'flex-1 rounded-full py-2 text-center text-[12px] font-bold transition-colors',
        active ? 'bg-ink text-paper' : 'text-ink-soft',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
