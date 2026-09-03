'use client';

import { useState, type FormEvent } from 'react';
import { applyAccountabilityAction, fetchUserAudit } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import {
  ACCOUNTABILITY_ACTION_LABELS,
  type AccountabilityAction,
  type ApplyAccountabilityActionInput,
  type ModerationReasonPreset,
  type UserAuditView,
} from '@/lib/types';
import { ReasonFields } from './ReasonFields';

// BL-033 / Foundation §11 / §14: the User Account Audit view. Strike history
// (0–3) plus the four standalone actions -- Issue Strike, Revoke Strike, Ban
// Outright, Restore Account -- each with the mandatory preset-or-freetext
// reason. There is no user directory in MVP scope, so an admin reaches an
// account by its id (from the flag queue, a report, or an email thread).

const ACTIONS: AccountabilityAction[] = [
  'ISSUE_STRIKE',
  'REVOKE_STRIKE',
  'BAN_OUTRIGHT',
  'RESTORE_ACCOUNT',
];

export function UserAudit() {
  const [idInput, setIdInput] = useState('');
  const [audit, setAudit] = useState<UserAuditView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setLoadError(messageFor('ACCOUNTABILITY', error));
    } finally {
      setLoading(false);
    }
  }

  async function onLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (idInput.trim()) {
      void load(idInput.trim());
    }
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

  return (
    <div className="max-w-3xl space-y-5">
      <form
        onSubmit={onLookup}
        data-testid="user-audit-lookup"
        className="flex gap-2"
      >
        <input
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          placeholder="User ID (uuid)"
          data-testid="user-audit-id"
          className="min-w-0 flex-1 rounded-[8px] border-[1.5px] border-line bg-surface px-3 py-2 font-mono text-[12px] text-ink"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-[8px] border-[1.5px] border-ink bg-ink px-4 py-2 text-[12px] font-bold text-paper disabled:opacity-45"
        >
          {loading ? 'Loading…' : 'Look up'}
        </button>
      </form>

      {loadError ? (
        <p
          data-testid="user-audit-error"
          className="rounded-[8px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2 text-[12px] text-clay-deep"
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
            <Stat label="User ID" value={audit.userId} mono />
            <Stat
              label="Strikes"
              value={`${audit.strikeCount} / 3`}
              tone={audit.strikeCount >= 3 ? 'bad' : 'neutral'}
            />
            <Stat
              label="Account"
              value={audit.isBanned ? 'Suspended' : 'Active'}
              tone={audit.isBanned ? 'bad' : 'good'}
            />
          </section>

          {flash ? (
            <p
              data-testid="user-audit-flash"
              className="rounded-[8px] border-[1.5px] border-moss-deep bg-moss-wash px-3 py-2 text-[12px] text-moss-deep"
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
              <legend className="label-caps text-[9px] text-ink-faint">
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
                      'rounded-[7px] border-[1.5px] px-2.5 py-1.5 text-[11px] font-semibold',
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
              <p className="text-[11px] text-ink-soft">
                Unified reversal: lifts any suspension and resets the strike
                count to zero.
              </p>
            ) : null}
            {action === 'BAN_OUTRIGHT' ? (
              <p className="text-[11px] text-clay-deep">
                Suspends immediately, independent of the strike count. The user
                is emailed and gets no in-app notification.
              </p>
            ) : null}

            {actionError ? (
              <p
                role="alert"
                data-testid="accountability-error"
                className="rounded-[8px] border-[1.5px] border-clay-deep bg-clay-wash px-2.5 py-2 text-[11.5px] text-clay-deep"
              >
                {actionError}
              </p>
            ) : null}

            <button
              type="submit"
              data-testid="accountability-submit"
              disabled={applying}
              className="rounded-[8px] border-[1.5px] border-ink bg-ink px-4 py-2 text-[12px] font-bold text-paper disabled:opacity-45"
            >
              {applying ? 'Applying…' : `Apply ${ACCOUNTABILITY_ACTION_LABELS[action]}`}
            </button>
          </form>

          <section data-testid="user-audit-history">
            <p className="label-caps text-[9px] text-ink-faint">
              Strike & ban history ({audit.history.length})
            </p>
            {audit.history.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-ink-faint">
                No accountability actions on record.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {audit.history.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid="audit-history-row"
                    data-action={entry.actionType}
                    className="card p-3 text-[11.5px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-ink">
                        {ACCOUNTABILITY_ACTION_LABELS[entry.actionType]}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-ink-soft">{entry.reasonText}</p>
                    {entry.triggeringMediaActionId ? (
                      <p className="mt-0.5 text-[10px] text-ink-faint">
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
      <p className="label-caps text-[9px] text-ink-faint">{label}</p>
      <p
        className={[
          'mt-0.5 font-bold',
          mono ? 'break-all font-mono text-[11px]' : 'text-[15px]',
          toneClass,
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
