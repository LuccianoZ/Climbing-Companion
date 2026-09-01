'use client';

import { useState, type FormEvent } from 'react';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import {
  ActionError,
  ActionSheet,
  ActionSubmit,
  ActionSuccess,
} from '@/components/ui/ActionSheet';
import { submitRouteVerification } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { formatGrade, gradeOptions, type GradeScale } from '@/lib/grades';
import type {
  CragDetail,
  MapRouteSummary,
  MediaAsset,
  SubmitRouteVerificationResult,
} from '@/lib/types';
import { RouteChoice, defaultRouteId } from './RouteChoice';

// BL-009 / BL-010 / BL-014. Three things the server requires together, in one
// submission: the verifier's own coordinates, a photo, and a grade vote.
//
// The photo is uploaded first and referenced by id -- POST /api/media returns
// a media_asset_id and the verification endpoint takes only that, never a
// file (Sprint1-Frontend-Scope section 4, AR-15/AR-24). ImageUploadField owns
// that round trip, so this sheet holds an id and never a File.
//
// The grade vote is not optional here even though a standalone "Vote on
// Grade" action exists (BL-015): SubmitRouteVerificationDto.gradeOrdinal has
// no @IsOptional, so a verification without one is a 400.
//
// AR-25: an already-VERIFIED route offers no verify button at all, which is
// where BL-010's cascade first becomes visible to a climber. Routes that
// reached four verifications are therefore struck out of the picker rather
// than silently failing on submit.

const cannotVerify = (route: MapRouteSummary) => route.status === 'VERIFIED';

export function VerifyRouteSheet({
  crag,
  viewer,
  scale,
  onClose,
  onCompleted,
}: {
  crag: CragDetail;
  viewer: { latitude: number; longitude: number };
  scale: GradeScale;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [chosenRouteId, setChosenRouteId] = useState<string | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [gradeOrdinal, setGradeOrdinal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitRouteVerificationResult | null>(null);

  // Derived, not stored: the picker's default is "the first route you are
  // allowed to verify", and a route reaching VERIFIED elsewhere changes that
  // answer without needing an effect to notice.
  const routeId = chosenRouteId ?? defaultRouteId(crag.routes, cannotVerify);
  const route = crag.routes.find((entry) => entry.id === routeId) ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!route || !asset || gradeOrdinal === null) {
      return;
    }

    setPending(true);
    try {
      const outcome = await submitRouteVerification(route.id, {
        mediaAssetId: asset.id,
        gradeOrdinal,
        latitude: viewer.latitude,
        longitude: viewer.longitude,
      });
      setResult(outcome);
      onCompleted();
    } catch (submitError) {
      setError(messageFor('VERIFY_ROUTE', submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <ActionSheet
      title="Verify route"
      subtitle={crag.name}
      testId="verify-route-sheet"
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-3">
          <ActionSuccess
            message={
              result.routeNewlyVerified
                ? 'That was the fourth verification — this route is now verified by the community.'
                : 'Verification submitted. Thanks for confirming this one exists.'
            }
          />
          {/* BL-010's cascade, stated plainly. A climber who verified one
              route has no way to know it happened to be its crag's founding
              route, and the crag changing status underneath them is otherwise
              unexplained. */}
          {result.cragNewlyVerified ? (
            <p
              data-testid="crag-cascaded"
              className="rounded-[10px] border-[1.5px] border-line bg-paper px-3 py-2.5 text-[11.5px] leading-snug text-ink-soft"
            >
              This was the founding route of {crag.name}, so the whole crag is
              now verified too.
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
          <RouteChoice
            routes={crag.routes}
            selectedId={routeId}
            onSelect={setChosenRouteId}
            scale={scale}
            isDisabled={cannotVerify}
            disabledHint="already verified"
            emptyHint="Every route here is already verified. Nothing left to confirm."
          />

          {route ? (
            <>
              <div data-testid="verify-progress" className="space-y-1">
                <div className="flex items-center justify-between text-[10.5px] text-ink-soft">
                  <span className="label-caps text-[9px] text-ink-faint">
                    Verification progress
                  </span>
                  <span>
                    {route.verificationCount} of {route.verificationsRequired}{' '}
                    independent photos approved
                  </span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-line-soft">
                  <span
                    className="block h-full rounded-full bg-moss"
                    style={{
                      width: `${Math.min(1, route.verificationCount / route.verificationsRequired) * 100}%`,
                    }}
                  />
                </span>
              </div>

              <ImageUploadField
                purpose="ROUTE_VERIFICATION_PHOTO"
                label="Upload verification photo"
                asset={asset}
                onUploaded={setAsset}
                disabled={pending}
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="verifyGradeOrdinal"
                  className="label-caps block text-[9.5px] text-ink-faint"
                >
                  Your grade for this route *
                </label>
                <select
                  id="verifyGradeOrdinal"
                  data-testid="verify-grade-select"
                  value={gradeOrdinal ?? ''}
                  onChange={(event) =>
                    setGradeOrdinal(
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none"
                >
                  <option value="">Select grade</option>
                  {gradeOptions(route.discipline, scale).map((option) => (
                    <option key={option.ordinal} value={option.ordinal}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] leading-snug text-ink-faint">
                  Currently{' '}
                  {route.grade.source === 'CONSENSUS' ? 'consensus' : 'proposed'}{' '}
                  at{' '}
                  {formatGrade(route.grade.gradeOrdinal, route.discipline, scale)}.
                  Verifying always casts a grade vote.
                </p>
              </div>

              <ActionError message={error} />

              <ActionSubmit
                testId="verify-route-submit"
                label="Verify route"
                pendingLabel="Verifying…"
                pending={pending}
                disabled={!asset || gradeOrdinal === null}
              />
            </>
          ) : null}
        </form>
      )}
    </ActionSheet>
  );
}
