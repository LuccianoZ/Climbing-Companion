'use client';

import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from '@/components/shell/icons';

// AR-25. Every in-range action opens one of these rather than pushing a
// route. Three reasons, in order of weight:
//
//   1. These are used standing at a crag with one hand on the phone. A route
//      push tears down the map, the open detail sheet, the selected pin and
//      the geolocation watch -- and coming back re-acquires GPS from cold,
//      which is exactly the state the 300m gate depends on.
//   2. The mockups draw them as sheets over the map, with the crag still
//      visible behind.
//   3. The action's whole context (which route, how far away, what the
//      current consensus is) is already on screen underneath.
//
// It renders above DetailSheet's z-[1100] so an action covers the panel that
// launched it rather than fighting it.

export function ActionSheet({
  title,
  subtitle,
  testId,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* The scrim is what makes "this is modal" true rather than implied:
          without it a climber can tap a pin behind an open action sheet and
          change the target out from under a half-filled form. */}
      <div
        data-testid="action-scrim"
        onClick={onClose}
        className="absolute inset-0 z-[1150] bg-ink/35"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="absolute inset-x-0 bottom-0 z-[1200] max-h-[88%] overflow-y-auto rounded-t-[18px] border-t-[1.5px] border-line bg-surface"
      >
        <div className="sticky top-0 z-10 bg-surface pt-2">
          <span className="mx-auto block h-1 w-10 rounded-full bg-line-soft" />
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-2.5">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold tracking-tight text-ink">
                {title}
              </h2>
              {subtitle ? (
                <p
                  data-testid="action-subtitle"
                  className="mt-0.5 truncate text-[11.5px] text-ink-soft"
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              data-testid="action-close"
              onClick={onClose}
              className="shrink-0 rounded-full border border-line-soft p-1 text-ink-soft"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-4 pb-7">{children}</div>
      </section>
    </>
  );
}

// The one place a failed action's message is rendered, so every sheet shows
// the same treatment and the UI suite has a single selector to assert on.
// Copy always comes from lib/errors.ts (AR-26) -- never from the server.
export function ActionError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      data-testid="action-error"
      className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] leading-snug text-clay-deep"
    >
      {message}
    </p>
  );
}

export function ActionSuccess({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="status"
      data-testid="action-success"
      className="rounded-[10px] border-[1.5px] border-line bg-moss-wash px-3 py-2.5 text-[12px] leading-snug text-moss-deep"
    >
      {message}
    </p>
  );
}

// Shared primary action. Disabled state is driven by the caller rather than
// inferred, because "what makes this submittable" differs per sheet (a photo
// and a grade for verification, an outcome for a log) and hiding that rule in
// here would put it out of reach of the form that owns it.
export function ActionSubmit({
  label,
  pendingLabel,
  pending,
  disabled,
  testId = 'action-submit',
  tone = 'ink',
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  testId?: string;
  tone?: 'ink' | 'clay';
}) {
  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={pending || disabled}
      className={[
        'w-full rounded-[10px] border-[1.5px] px-4 py-3 text-[13px] font-bold transition-opacity disabled:opacity-45',
        tone === 'clay'
          ? 'border-clay-deep bg-clay text-ink'
          : 'border-ink bg-ink text-paper',
      ].join(' ')}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
