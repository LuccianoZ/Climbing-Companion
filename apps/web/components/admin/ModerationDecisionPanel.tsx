'use client';

import { useState, type FormEvent } from 'react';
import { moderateMedia } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import {
  MODERATION_REASON_MAX_LENGTH,
  MODERATION_REASON_PRESET_LABELS,
  isVerificationPhoto,
  type FlagQueueItem,
  type ModerateMediaInput,
  type ModerationReasonPreset,
} from '@/lib/types';

// BL-028 / Foundation §11 / §14. Approve / Reject / Reject+Strike /
// Reject+Ban on one asset, with the preset dropdown + editable 500-char
// reason field the spec calls for.
//
// AR-1 is the rule this panel exists to enforce: for a verification photo,
// rejection ALWAYS strikes — there is no plain "Reject" button, and the
// reason is mandatory. For an ordinary photo, a bare reject needs no reason,
// but pairing it with a strike or ban makes one mandatory (AR-42). OTHER
// always needs freehand text.

type Action = 'APPROVE' | 'REJECT' | 'REJECT_STRIKE' | 'REJECT_BAN';

const PRESETS = Object.keys(
  MODERATION_REASON_PRESET_LABELS,
) as ModerationReasonPreset[];

export function ModerationDecisionPanel({
  item,
  onResolved,
}: {
  item: FlagQueueItem;
  onResolved: () => void;
}) {
  const verificationPhoto = isVerificationPhoto(item.purpose);

  const [action, setAction] = useState<Action>('APPROVE');
  const [preset, setPreset] = useState<ModerationReasonPreset | ''>('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isReject = action !== 'APPROVE';
  // Verification-photo rejection always strikes (AR-1); otherwise the pairing
  // is what the admin picked.
  const strikes = verificationPhoto || action === 'REJECT_STRIKE';
  const bans = action === 'REJECT_BAN';
  const reasonRequired = isReject && (verificationPhoto || strikes || bans);
  const otherNeedsText = preset === 'OTHER' && text.trim().length === 0;
  const missingReason = reasonRequired && preset === '' && text.trim().length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (missingReason || otherNeedsText) {
      return;
    }

    const input: ModerateMediaInput =
      action === 'APPROVE'
        ? { decision: 'APPROVE' }
        : {
            decision: 'REJECT',
            ...(preset ? { reasonPreset: preset } : {}),
            ...(text.trim() ? { reasonText: text.trim() } : {}),
            ...(action === 'REJECT_STRIKE'
              ? { pairedAction: 'ISSUE_STRIKE' as const }
              : {}),
            ...(action === 'REJECT_BAN'
              ? { pairedAction: 'BAN_OUTRIGHT' as const }
              : {}),
          };

    setPending(true);
    try {
      await moderateMedia(item.mediaAssetId, input);
      onResolved();
    } catch (submitError) {
      setError(messageFor('MODERATE_MEDIA', submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      data-testid="moderation-decision"
      data-media-id={item.mediaAssetId}
      className="space-y-3 rounded-[8px] border border-line-soft bg-paper p-3"
    >
      <fieldset className="space-y-1.5">
        <legend className="label-caps text-[9px] text-ink-faint">Decision</legend>
        <div className="flex flex-wrap gap-1.5">
          <ActionButton
            current={action}
            value="APPROVE"
            label="Approve"
            onPick={setAction}
          />
          {verificationPhoto ? (
            <ActionButton
              current={action}
              value="REJECT_STRIKE"
              label="Reject — strikes uploader (AR-1)"
              onPick={setAction}
            />
          ) : (
            <>
              <ActionButton
                current={action}
                value="REJECT"
                label="Reject"
                onPick={setAction}
              />
              <ActionButton
                current={action}
                value="REJECT_STRIKE"
                label="Reject + Strike"
                onPick={setAction}
              />
              <ActionButton
                current={action}
                value="REJECT_BAN"
                label="Reject + Ban"
                onPick={setAction}
              />
            </>
          )}
        </div>
      </fieldset>

      {isReject ? (
        <div className="space-y-2">
          <label className="block">
            <span className="label-caps text-[9px] text-ink-faint">
              Reason preset {reasonRequired ? '*' : '(optional)'}
            </span>
            <select
              data-testid="moderation-reason-preset"
              value={preset}
              onChange={(e) =>
                setPreset(e.target.value as ModerationReasonPreset | '')
              }
              className="mt-1 w-full rounded-[8px] border-[1.5px] border-line-soft bg-surface px-2.5 py-2 text-[12px] text-ink"
            >
              <option value="">— none —</option>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {MODERATION_REASON_PRESET_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-caps text-[9px] text-ink-faint">
              Reason text{' '}
              {preset === 'OTHER' ? '*' : '(fills the email to the user)'}
            </span>
            <textarea
              data-testid="moderation-reason-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MODERATION_REASON_MAX_LENGTH}
              rows={2}
              className="mt-1 w-full rounded-[8px] border-[1.5px] border-line-soft bg-surface px-2.5 py-2 text-[12px] text-ink"
            />
            <span className="text-[10px] text-ink-faint">
              {text.length}/{MODERATION_REASON_MAX_LENGTH}
            </span>
          </label>

          {strikes ? (
            <p className="text-[11px] text-clay-deep">
              The uploader is emailed and receives a strike. Three strikes
              auto-suspend the account.
            </p>
          ) : null}
          {bans ? (
            <p className="text-[11px] text-clay-deep">
              The uploader is suspended immediately and emailed the reason.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="moderation-error"
          className="rounded-[8px] border-[1.5px] border-clay-deep bg-clay-wash px-2.5 py-2 text-[11.5px] text-clay-deep"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="moderation-submit"
        disabled={pending || missingReason || otherNeedsText}
        className="rounded-[8px] border-[1.5px] border-ink bg-ink px-3.5 py-2 text-[12px] font-bold text-paper disabled:opacity-45"
      >
        {pending ? 'Applying…' : 'Apply decision'}
      </button>
    </form>
  );
}

function ActionButton({
  current,
  value,
  label,
  onPick,
}: {
  current: Action;
  value: Action;
  label: string;
  onPick: (a: Action) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      data-testid={`moderation-action-${value}`}
      aria-pressed={active}
      onClick={() => onPick(value)}
      className={[
        'rounded-[7px] border-[1.5px] px-2.5 py-1.5 text-[11px] font-semibold',
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-line-soft bg-surface text-ink-soft',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
