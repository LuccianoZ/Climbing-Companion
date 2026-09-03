'use client';

import { useState, type FormEvent } from 'react';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import {
  ActionError,
  ActionSheet,
  ActionSubmit,
  ActionSuccess,
} from '@/components/ui/ActionSheet';
import { submitGymVerification } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { MODERATION_REASON_MAX_LENGTH } from '@/lib/types';
import type {
  GymDetail,
  MediaAsset,
  SubmitGymVerificationResult,
} from '@/lib/types';

// BL-011 + Sept 3 revision (AR-51, BL-x06): gym verification is now
// confirm/dispute, not data re-entry.
//
//   * "Yes, it's accurate" counts toward the four. A photo is now OPTIONAL,
//     and the disciplines are not re-entered -- the gym's list is
//     authoritative from submission (BL-x04).
//   * "No" opens a free-text "what's inaccurate?" (<=500 chars) that is
//     routed to the admin dispute queue and does NOT count.

export function VerifyGymSheet({
  gym,
  viewer,
  onClose,
  onCompleted,
}: {
  gym: GymDetail;
  viewer: { latitude: number; longitude: number };
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [accurate, setAccurate] = useState<boolean | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [disputeDetail, setDisputeDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitGymVerificationResult | null>(null);

  const canSubmit =
    accurate === true || (accurate === false && disputeDetail.trim().length > 0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (accurate === null) return;

    setPending(true);
    try {
      const outcome = await submitGymVerification(gym.id, {
        informationAccurate: accurate,
        mediaAssetId: accurate && asset ? asset.id : undefined,
        disputeDetail: accurate ? undefined : disputeDetail.trim(),
        latitude: viewer.latitude,
        longitude: viewer.longitude,
      });
      setResult(outcome);
      onCompleted();
    } catch (submitError) {
      setError(messageFor('VERIFY_GYM', submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <ActionSheet
      title="Verify gym"
      subtitle={gym.name}
      testId="verify-gym-sheet"
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-3">
          <ActionSuccess
            message={
              result.outcome === 'DISPUTED'
                ? 'Thanks — that goes to an admin to review. It does not count toward verification.'
                : result.gymNewlyVerified
                  ? 'That was the fourth confirmation — this gym is now verified by the community.'
                  : 'Confirmation submitted. Thanks for checking this one.'
            }
          />
          <button
            type="button"
            data-testid="verify-done"
            onClick={onClose}
            className="w-full rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-3 text-[13px] font-bold text-paper"
          >
            Done
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <fieldset data-testid="gym-accuracy-choice" className="space-y-2">
            <legend className="label-caps text-[9.5px] text-ink-faint">
              Is the submission information accurate? *
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: 'Yes, it’s accurate' },
                { value: false, label: 'No, something’s wrong' },
              ].map((option) => {
                const active = accurate === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={active}
                    data-testid={`gym-accurate-${option.value ? 'yes' : 'no'}`}
                    onClick={() => setAccurate(option.value)}
                    className={[
                      'rounded-[10px] border-[1.5px] px-2.5 py-2.5 text-[11.5px] font-bold',
                      active
                        ? option.value
                          ? 'border-moss-deep bg-moss-wash text-moss-deep'
                          : 'border-clay-deep bg-clay-wash text-clay-deep'
                        : 'border-line-soft bg-surface text-ink-soft',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {accurate === true ? (
            <div data-testid="gym-confirm-body" className="space-y-2">
              <ImageUploadField
                purpose="GYM_VERIFICATION_PHOTO"
                label="Add a photo (optional)"
                hint="Optional since the Sept 3 update — a confirmation counts either way."
                asset={asset}
                onUploaded={setAsset}
                disabled={pending}
              />
            </div>
          ) : null}

          {accurate === false ? (
            <div data-testid="gym-dispute-body" className="space-y-1.5">
              <label
                htmlFor="dispute-detail"
                className="label-caps block text-[9.5px] text-ink-faint"
              >
                What is inaccurate? *
              </label>
              <textarea
                id="dispute-detail"
                data-testid="dispute-detail"
                rows={4}
                maxLength={MODERATION_REASON_MAX_LENGTH}
                value={disputeDetail}
                placeholder="e.g. The bouldering wall is closed, or the Friday hours are wrong…"
                onChange={(event) => setDisputeDetail(event.target.value)}
                className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
              />
              <p className="text-[10.5px] text-ink-faint">
                {MODERATION_REASON_MAX_LENGTH - disputeDetail.length} left · an
                admin reviews this, it does not count toward the four.
              </p>
            </div>
          ) : null}

          <ActionError message={error} />

          <ActionSubmit
            testId="verify-gym-submit"
            label={accurate === false ? 'Send to admin' : 'Confirm gym'}
            pendingLabel="Submitting…"
            pending={pending}
            disabled={!canSubmit}
          />
        </form>
      )}
    </ActionSheet>
  );
}
