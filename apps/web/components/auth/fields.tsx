'use client';

import { useState, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon } from '@/components/shell/icons';

// The form primitives every auth screen shares. Extracted not for reuse's own
// sake but because the four screens must agree on one thing: where a
// validation message appears relative to the field it belongs to. Sprint 1's
// scope doc asks for server 4xx surfaced *inline*, and inline means "attached
// to a field" only if every field agrees on what that looks like.

export function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="label-caps block text-[9.5px] text-ink-faint"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-[10.5px] leading-snug text-ink-faint">{hint}</p>
      ) : null}
      {error ? (
        <p
          data-testid={`field-error-${htmlFor}`}
          className="text-[10.5px] leading-snug text-clay-deep"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  icon,
  hint,
  error,
  autoComplete,
  maxLength,
}: {
  label: string;
  name: string;
  type?: 'text' | 'email';
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <FieldShell label={label} htmlFor={name} hint={hint} error={error}>
      <div
        className={[
          'flex items-center gap-2 rounded-[10px] border-[1.5px] bg-surface px-3',
          error ? 'border-clay-deep' : 'border-line',
        ].join(' ')}
      >
        {icon ? <span className="shrink-0 text-ink-faint">{icon}</span> : null}
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
    </FieldShell>
  );
}

// The eye toggle the mockup draws on the password field. It is not decoration:
// a password typed one-handed at a crag on a phone keyboard is exactly the
// case where being unable to check what you typed causes the lockout.
export function PasswordField({
  label,
  name,
  value,
  onChange,
  hint,
  error,
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <FieldShell label={label} htmlFor={name} hint={hint} error={error}>
      <div
        className={[
          'flex items-center gap-2 rounded-[10px] border-[1.5px] bg-surface px-3',
          error ? 'border-clay-deep' : 'border-line',
        ].join(' ')}
      >
        <input
          id={name}
          name={name}
          type={revealed ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          placeholder="••••••••"
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="button"
          data-testid={`reveal-${name}`}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
          className="shrink-0 rounded p-1 text-ink-faint"
        >
          {revealed ? (
            <EyeOffIcon className="h-4 w-4" />
          ) : (
            <EyeIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </FieldShell>
  );
}

// Form-level failure, as opposed to a per-field one: a rejected login, an
// email already in use, an unreachable API. Copy always comes from
// lib/errors.ts (AR-26).
export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      data-testid="form-error"
      className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] leading-snug text-clay-deep"
    >
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="status"
      data-testid="form-notice"
      className="rounded-[10px] border-[1.5px] border-line bg-moss-wash px-3 py-2.5 text-[12px] leading-snug text-moss-deep"
    >
      {message}
    </p>
  );
}

export function PrimaryButton({
  label,
  pendingLabel,
  pending,
  disabled,
  testId,
  icon,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  testId: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={pending || disabled}
      className="label-caps flex w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-3 text-[11.5px] text-paper transition-opacity disabled:opacity-45"
    >
      {pending ? pendingLabel : label}
      {!pending && icon ? icon : null}
    </button>
  );
}

// Mirrors RegisterDto/ConfirmPasswordResetDto so the form fails before the
// round trip. Deliberately the same rule, not a stricter one: a client-side
// policy the server does not enforce would reject passwords the API would
// have accepted, which is a bug the user cannot diagnose.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Enter your email address.';
  }
  // Same shape class-validator's @IsEmail accepts for ordinary addresses.
  // Kept loose on purpose: the server is authoritative, and an over-strict
  // regex here would reject valid addresses before they ever reach it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'That does not look like an email address.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Enter a password.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Passwords must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}
