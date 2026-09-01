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
import {
  GYM_DISCIPLINES,
  GYM_DISCIPLINE_LABELS,
  type GymDetail,
  type GymDiscipline,
  type MediaAsset,
  type SubmitGymVerificationResult,
} from '@/lib/types';

// BL-011. The same shape as route verification -- 300m-gated, photo required,
// self-verification and duplicates both refused -- with one field swapped:
// there is no grade vote, because gyms have no grade-consensus concept at all
// (Architecture section 4). In its place, the disciplines this verifier
// actually saw on the walls.
//
// At least one is required (SubmitGymVerificationDto's @ArrayMinSize(1)), and
// the answer is not a vote: on the fourth verification the server sets
// gyms.disciplines_offered to the *union* of all four verifiers' arrays
// (AR-17). Reporting only what you personally saw is therefore the right
// behaviour, not an incomplete one -- which is what the hint below says,
// because the natural instinct is to try to list everything.

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
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [disciplines, setDisciplines] = useState<GymDiscipline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitGymVerificationResult | null>(null);

  function toggle(item: GymDiscipline) {
    setDisciplines((current) =>
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!asset || disciplines.length === 0) {
      return;
    }

    setPending(true);
    try {
      const outcome = await submitGymVerification(gym.id, {
        mediaAssetId: asset.id,
        disciplinesSubmitted: disciplines,
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
              result.gymNewlyVerified
                ? 'That was the fourth verification — this gym is now verified by the community.'
                : 'Verification submitted. Thanks for confirming this one exists.'
            }
          />
          {result.gymNewlyVerified ? (
            <p
              data-testid="gym-disciplines-set"
              className="rounded-[10px] border-[1.5px] border-line bg-paper px-3 py-2.5 text-[11.5px] leading-snug text-ink-soft"
            >
              Its listed disciplines are now the combined answer from all four
              verifiers:{' '}
              {result.gym.disciplinesOffered
                .map((item) => GYM_DISCIPLINE_LABELS[item] ?? item)
                .join(', ')}
              .
            </p>
          ) : null}
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
          <ImageUploadField
            purpose="GYM_VERIFICATION_PHOTO"
            label="Upload verification photo"
            asset={asset}
            onUploaded={setAsset}
            disabled={pending}
          />

          <fieldset data-testid="gym-discipline-choice" className="space-y-2">
            <legend className="label-caps text-[9.5px] text-ink-faint">
              Disciplines you saw here *
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {GYM_DISCIPLINES.map((item) => {
                const checked = disciplines.includes(item);
                return (
                  <label
                    key={item}
                    data-testid={`gym-discipline-${item}`}
                    className={[
                      'flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-2.5 py-2 text-[11.5px] font-medium',
                      checked
                        ? 'border-ink bg-paper text-ink'
                        : 'border-line-soft bg-surface text-ink-soft',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      value={item}
                      checked={checked}
                      onChange={() => toggle(item)}
                      className="h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
                    />
                    {GYM_DISCIPLINE_LABELS[item]}
                  </label>
                );
              })}
            </div>
            <p className="text-[10.5px] leading-snug text-ink-faint">
              Only what you saw. The gym&apos;s final list is everything its
              four verifiers reported between them, so gaps get filled in.
            </p>
          </fieldset>

          <ActionError message={error} />

          <ActionSubmit
            testId="verify-gym-submit"
            label="Verify gym"
            pendingLabel="Verifying…"
            pending={pending}
            disabled={!asset || disciplines.length === 0}
          />
        </form>
      )}
    </ActionSheet>
  );
}
