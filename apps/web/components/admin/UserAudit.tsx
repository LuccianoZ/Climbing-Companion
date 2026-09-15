'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  applyAccountabilityAction,
  fetchUserAudit,
  searchAdminUsers,
} from '@/lib/api';
import { messageFor } from '@/lib/errors';
import {
  ACCOUNTABILITY_ACTION_LABELS,
  type AccountabilityAction,
  type AdminUserSearchResult,
  type ApplyAccountabilityActionInput,
  type ModerationReasonPreset,
  type UserAuditView,
} from '@/lib/types';
import { ReasonFields } from './ReasonFields';

// BL-033 / Foundation §11 / §14: the User Account Audit view. Strike history
// (0–3) plus the four standalone actions -- Issue Strike, Revoke Strike, Ban
// Outright, Restore Account -- each with the mandatory preset-or-freetext
// reason.
//
// The box is a typeahead over display name / email, matching the map's
// SearchBar (same debounce, same abort-the-superseded-request rule, same
// stamped-results trick to avoid a setState in the effect body). A full
// uuid pasted in still resolves in one hop, so the pre-existing "I already
// have the id from the flag queue" path is unchanged.
//
// This is admin-only and is NOT the user directory Foundation §18 cuts:
// that cut is about climbers discovering strangers to friend (§12 -- there
// is no discovery surface by design). Reaching an account to moderate it is
// §14's whole premise; only the lookup mechanism changed.

const ACTIONS: AccountabilityAction[] = [
  'ISSUE_STRIKE',
  'REVOKE_STRIKE',
  'BAN_OUTRIGHT',
  'RESTORE_ACCOUNT',
];

const DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;

export function UserAudit() {
  const [idInput, setIdInput] = useState('');
  const [audit, setAudit] = useState<UserAuditView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Stamped with the term they answer, so "is this list still relevant?" is
  // derived at render time rather than synchronously set from the effect.
  const [matches, setMatches] = useState<{
    term: string;
    items: AdminUserSearchResult[];
    failed: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedTerm = idInput.trim();

  const [action, setAction] = useState<AccountabilityAction>('ISSUE_STRIKE');
  const [preset, setPreset] = useState<ModerationReasonPreset | ''>('');
  const [text, setText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function load(userId: string) {
    setLoading(true);
    setLoadError(null);
    setFlash(null);
    try {
      setAudit(await fetchUserAudit(userId));
    } catch (error) {
      setAudit(null);
      // USER_AUDIT, not ACCOUNTABILITY: the two calls share a URL but not a
      // failure mode. A 400 here is ParseUUIDPipe rejecting a non-uuid,
      // which ACCOUNTABILITY's copy described as "a reason is required".
      setLoadError(messageFor('USER_AUDIT', error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const trimmed = idInput.trim();
    if (trimmed.length < MIN_TERM_LENGTH) {
      return;
    }

    // Every superseded request is aborted rather than left to resolve out of
    // order -- typing "lu" then "lucci" must not end up showing "lu"'s rows
    // because they landed second.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAdminUsers(trimmed, controller.signal)
        .then((found) =>
          setMatches({ term: trimmed, items: found, failed: false }),
        )
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          setMatches({ term: trimmed, items: [], failed: true });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [idInput]);

  function pick(result: AdminUserSearchResult) {
    setIdInput(result.displayName);
    setDismissed(true);
    inputRef.current?.blur();
    void load(result.userId);
  }

  async function onLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = idInput.trim();
    if (!trimmed) return;

    // Enter with exactly one suggestion showing picks it -- otherwise the
    // admin would have to click, and a name typed in full would be sent to
    // an endpoint that only accepts a uuid.
    const visibleItems =
      matches && matches.term === trimmed && !matches.failed
        ? matches.items
        : [];
    if (visibleItems.length === 1) {
      pick(visibleItems[0]);
      return;
    }

    setDismissed(true);
    void load(trimmed);
  }

  async function onApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audit) return;
    setActionError(null);

    const otherNeedsText = preset === 'OTHER' && text.trim() === '';
    const noReason = preset === '' && text.trim() === '';
    if (otherNeedsText || noReason) {
      setActionError(
        'A reason is required — pick a preset or write one (required for “Other”).',
      );
      return;
    }

    const input: ApplyAccountabilityActionInput = {
      action,
      ...(preset ? { reasonPreset: preset } : {}),
      ...(text.trim() ? { reasonText: text.trim() } : {}),
    };

    setApplying(true);
    try {
      const result = await applyAccountabilityAction(audit.userId, input);
      setPreset('');
      setText('');
      setFlash(
        result.autoBanned
          ? 'Strike issued — that was the third, so the account is auto-suspended. The user is emailed.'
          : `${ACCOUNTABILITY_ACTION_LABELS[result.action]} applied. Strikes: ${result.strikeCount}${result.isBanned ? ' · suspended' : ''}. The user is emailed.`,
      );
      await load(audit.userId);
    } catch (error) {
      setActionError(messageFor('ACCOUNTABILITY', error));
    } finally {
      setApplying(false);
    }
  }

  // Only ever show a list that answers the term currently in the box, and
  // only until the admin picks something from it.
  const suggestionsOpen =
    matches !== null &&
    matches.term === trimmedTerm &&
    trimmedTerm.length >= MIN_TERM_LENGTH &&
    !dismissed;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="relative">
        <form
          onSubmit={onLookup}
          data-testid="user-audit-lookup"
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={idInput}
            onChange={(e) => {
              setIdInput(e.target.value);
              setDismissed(false);
            }}
            placeholder="Search by name or email, or paste a user id…"
            data-testid="user-audit-id"
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestionsOpen}
            aria-controls="user-audit-suggestions"
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-3 py-2 text-small text-ink"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-control border border-ink bg-ink px-4 py-2 text-small font-bold text-paper disabled:opacity-45"
          >
            {loading ? 'Loading…' : 'Look up'}
          </button>
        </form>

        {suggestionsOpen ? (
          <ul
            id="user-audit-suggestions"
            role="listbox"
            data-testid="user-audit-suggestions"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-line bg-surface shadow-overlay"
          >
            {matches.items.length === 0 ? (
              <li
                data-testid="user-audit-suggestions-empty"
                className="px-3 py-3 text-small text-ink-faint"
              >
                {matches.failed
                  ? 'Account search is unavailable right now.'
                  : `No account matches “${trimmedTerm}”.`}
              </li>
            ) : (
              matches.items.map((result) => (
                <li
                  key={result.userId}
                  className="border-b border-line-soft last:border-b-0"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    data-testid="user-audit-suggestion"
                    data-user-id={result.userId}
                    onClick={() => pick(result)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink">
                        {result.displayName}
                      </span>
                      <span className="block truncate font-mono text-caption text-ink-faint">
                        {result.email}
                      </span>
                    </span>
                    {/* The two things an admin is triaging on, visible
                        before they commit to opening the account. */}
                    {result.isBanned ? (
                      <span className="shrink-0 rounded-control bg-clay-wash px-1.5 py-0.5 text-caption font-bold text-clay-deep">
                        Suspended
                      </span>
                    ) : null}
                    {result.strikeCount > 0 ? (
                      <span className="shrink-0 font-mono text-caption text-ink-faint">
                        {result.strikeCount}/3
                      </span>
                    ) : null}
                    {result.role === 'SYSTEM_ADMIN' ? (
                      <span className="label-caps shrink-0 text-caption text-ink-faint">
                        Admin
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {loadError ? (
        <p
          data-testid="user-audit-error"
          className="rounded-control border border-clay-deep bg-clay-wash px-3 py-2 text-small text-clay-deep"
        >
          {loadError}
        </p>
      ) : null}

      {audit ? (
        <>
          <section
            data-testid="user-audit-summary"
            className="card-raised grid grid-cols-2 gap-3 p-4 sm:grid-cols-3"
          >
            <Stat label="Climber" value={audit.displayName} />
            <Stat label="Email" value={audit.email} mono />
            <Stat label="User ID" value={audit.userId} mono />
            <Stat
              label="Strikes"
              value={`${audit.strikeCount} / 3`}
              tone={audit.strikeCount >= 3 ? 'bad' : 'neutral'}
            />
            <Stat
              label="Status"
              value={audit.isBanned ? 'Suspended' : 'Active'}
              tone={audit.isBanned ? 'bad' : 'good'}
            />
          </section>

          {flash ? (
            <p
              data-testid="user-audit-flash"
              className="rounded-control border border-moss-deep bg-moss-wash px-3 py-2 text-small text-moss-deep"
            >
              {flash}
            </p>
          ) : null}

          <form
            onSubmit={onApply}
            data-testid="accountability-panel"
            className="card space-y-3 p-4"
          >
            <fieldset className="space-y-1.5">
              <legend className="label-caps text-caption text-ink-faint">
                Action
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {ACTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={action === a}
                    data-testid={`accountability-action-${a}`}
                    onClick={() => setAction(a)}
                    className={[
                      'rounded-control border px-2.5 py-1.5 text-caption font-semibold',
                      action === a
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line-soft bg-surface text-ink-soft',
                    ].join(' ')}
                  >
                    {ACCOUNTABILITY_ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            </fieldset>

            <ReasonFields
              preset={preset}
              text={text}
              onPreset={setPreset}
              onText={setText}
              disabled={applying}
            />

            {action === 'RESTORE_ACCOUNT' ? (
              <p className="text-caption text-ink-soft">
                Unified reversal: lifts any suspension and resets the strike
                count to zero.
              </p>
            ) : null}
            {action === 'BAN_OUTRIGHT' ? (
              <p className="text-caption text-clay-deep">
                Suspends immediately, independent of the strike count. The user
                is emailed and gets no in-app notification.
              </p>
            ) : null}

            {actionError ? (
              <p
                role="alert"
                data-testid="accountability-error"
                className="rounded-control border border-clay-deep bg-clay-wash px-2.5 py-2 text-small text-clay-deep"
              >
                {actionError}
              </p>
            ) : null}

            <button
              type="submit"
              data-testid="accountability-submit"
              disabled={applying}
              className="rounded-control border border-ink bg-ink px-4 py-2 text-small font-bold text-paper disabled:opacity-45"
            >
              {applying ? 'Applying…' : `Apply ${ACCOUNTABILITY_ACTION_LABELS[action]}`}
            </button>
          </form>

          <section data-testid="user-audit-history">
            <p className="label-caps text-caption text-ink-faint">
              Strike & ban history ({audit.history.length})
            </p>
            {audit.history.length === 0 ? (
              <p className="mt-1.5 text-small text-ink-faint">
                No accountability actions on record.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {audit.history.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid="audit-history-row"
                    data-action={entry.actionType}
                    className="card p-3 text-small"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-ink">
                        {ACCOUNTABILITY_ACTION_LABELS[entry.actionType]}
                      </span>
                      <span className="font-mono text-caption text-ink-faint">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-ink-soft">{entry.reasonText}</p>
                    {entry.triggeringMediaActionId ? (
                      <p className="mt-0.5 text-caption text-ink-faint">
                        From a photo rejection.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  mono = false,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const toneClass =
    tone === 'bad'
      ? 'text-clay-deep'
      : tone === 'good'
        ? 'text-moss-deep'
        : 'text-ink';
  return (
    <div>
      <p className="label-caps text-caption text-ink-faint">{label}</p>
      <p
        className={[
          'mt-0.5 font-bold',
          mono ? 'break-all font-mono text-caption' : 'text-body',
          toneClass,
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
