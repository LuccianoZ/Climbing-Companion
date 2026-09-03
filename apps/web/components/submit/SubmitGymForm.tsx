'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { FormError, TextField } from '@/components/auth/fields';
import { CheckIcon } from '@/components/shell/icons';
import { MultiImageUploadField } from '@/components/media/MultiImageUploadField';
import { submitGym } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { PROXIMITY_METERS } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { useViewerLocation } from '@/lib/use-viewer-location';
import {
  GYM_DISCIPLINES,
  GYM_DISCIPLINE_LABELS,
  MIN_SUBMISSION_PHOTOS,
  type GymDiscipline,
  type MediaAsset,
  type OperatingHours,
  type SubmitGymInput,
  type SubmitGymResult,
} from '@/lib/types';
import { LocationPicker, type LatLng } from './LocationPicker';
import {
  OperatingHoursEditor,
  defaultOperatingHours,
} from './OperatingHoursEditor';
import { SubmitShell } from './SubmitShell';

// BL-007 + Sept 3 revision (AR-51, BL-x02/x03/x04/x05). A gym submission now
// carries its disciplines, its full weekly hours, and >= 3 photos up front,
// and a non-admin's pin is locked to a 300m circle around their live
// location (the server re-checks with PostGIS regardless). A SYSTEM_ADMIN
// submits from anywhere and the gym is created VERIFIED.

const FALLBACK_POINT: LatLng = { latitude: 37.7338, longitude: -119.5676 };

export function SubmitGymForm() {
  const { isAdmin } = useSession();
  const viewerState = useViewerLocation();
  const viewer =
    viewerState.status === 'ready'
      ? { latitude: viewerState.latitude, longitude: viewerState.longitude }
      : null;

  const [name, setName] = useState('');
  const [disciplines, setDisciplines] = useState<GymDiscipline[]>([]);
  const [hours, setHours] = useState<OperatingHours>(() =>
    defaultOperatingHours(),
  );
  const [photos, setPhotos] = useState<MediaAsset[]>([]);
  const [pick, setPick] = useState<LatLng | null>(null);
  const [usedGpsFix, setUsedGpsFix] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitGymResult | null>(null);

  // For a non-admin the pin starts at the device location and is clamped to
  // the 300m circle. For an admin there is no constraint and no auto-place.
  const point: LatLng = pick ?? (isAdmin ? FALLBACK_POINT : viewer ?? FALLBACK_POINT);
  const placed = isAdmin
    ? pick !== null
    : pick !== null || (usedGpsFix && viewer !== null);
  const constrainTo =
    !isAdmin && viewer
      ? { centre: viewer, radiusMeters: PROXIMITY_METERS }
      : null;

  function toggleDiscipline(item: GymDiscipline) {
    setDisciplines((current) =>
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Give the gym a name.';
    if (disciplines.length === 0)
      errors.disciplines = 'Pick at least one discipline the gym offers.';
    if (photos.length < MIN_SUBMISSION_PHOTOS)
      errors.photos = `Upload at least ${MIN_SUBMISSION_PHOTOS} photos.`;
    if (!isAdmin && !viewer)
      errors.location =
        'Location access is needed to place a gym within 300m of you.';
    if (!placed) errors.location = 'Place the pin on the gym before submitting.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: SubmitGymInput = {
      name: name.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
      disciplinesOffered: disciplines,
      operatingHours: hours,
      photoMediaIds: photos.map((p) => p.id),
    };
    if (!isAdmin && viewer) {
      payload.deviceLatitude = viewer.latitude;
      payload.deviceLongitude = viewer.longitude;
    }

    setPending(true);
    try {
      setResult(await submitGym(payload));
    } catch (error) {
      setFormError(messageFor('SUBMIT_GYM', error));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const verified = result.status === 'VERIFIED';
    return (
      <SubmitShell
        title="Gym submitted"
        subtitle={
          verified
            ? 'Created verified — it is on the map now.'
            : 'It is on the map now, waiting for four climbers to confirm it.'
        }
      >
        <div
          data-testid="submit-gym-success"
          className="card-raised space-y-4 p-4"
        >
          <p className="flex items-center gap-2 text-[13px] font-bold text-moss-deep">
            <CheckIcon className="h-4 w-4" />
            {result.name} is live
          </p>
          <p className="text-[12px] leading-relaxed text-ink-soft">
            {verified
              ? 'Your photos are published straight away. The disciplines and hours you entered are authoritative.'
              : 'Your photos are pending admin approval — the detail panel shows that until one is approved. Verifiers confirm your information rather than re-entering it.'}
          </p>
          <Link
            href={`/?kind=GYM&id=${result.id}&lat=${point.latitude}&lng=${point.longitude}&name=${encodeURIComponent(result.name)}`}
            data-testid="view-on-map"
            className="label-caps block rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-3 text-center text-[11.5px] text-paper"
          >
            View it on the map
          </Link>
        </div>
      </SubmitShell>
    );
  }

  return (
    <SubmitShell
      title="Submit new gym"
      subtitle={
        isAdmin
          ? 'As an admin this gym is created verified from wherever you are.'
          : 'Drop the pin on the gym — it has to be within 300m of where you are standing.'
      }
    >
      <form
        noValidate
        onSubmit={onSubmit}
        data-testid="submit-gym-form"
        data-admin={isAdmin ? 'true' : 'false'}
        className="space-y-4"
      >
        <div className="card space-y-4 p-3.5">
          <TextField
            label="Gym name *"
            name="name"
            value={name}
            onChange={setName}
            placeholder="e.g. Vertical Edge Climbing Gym"
            maxLength={100}
            error={fieldErrors.name}
          />

          <LocationPicker
            point={point}
            placed={placed}
            locationAvailable={viewer !== null}
            error={fieldErrors.location}
            constrainTo={constrainTo}
            onPick={(next) => {
              setPick(next);
              setUsedGpsFix(false);
            }}
            onUseMyLocation={() => {
              if (viewer) {
                setPick(viewer);
                setUsedGpsFix(true);
              }
            }}
          />

          <fieldset data-testid="gym-disciplines-choice" className="space-y-2">
            <legend className="label-caps text-[9.5px] text-ink-faint">
              Disciplines offered *
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
                      onChange={() => toggleDiscipline(item)}
                      className="h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
                    />
                    {GYM_DISCIPLINE_LABELS[item]}
                  </label>
                );
              })}
            </div>
            {fieldErrors.disciplines ? (
              <p className="text-[10.5px] text-clay-deep">
                {fieldErrors.disciplines}
              </p>
            ) : null}
          </fieldset>

          <OperatingHoursEditor value={hours} onChange={setHours} />

          <div className="space-y-1.5">
            <MultiImageUploadField
              purpose="GYM_SUBMISSION_PHOTO"
              assets={photos}
              onChange={setPhotos}
              disabled={pending}
            />
            {fieldErrors.photos ? (
              <p className="text-[10.5px] text-clay-deep">{fieldErrors.photos}</p>
            ) : null}
          </div>
        </div>

        <FormError message={formError} />

        <button
          type="submit"
          data-testid="submit-gym"
          disabled={pending}
          className="w-full rounded-[10px] border-[1.5px] border-clay-deep bg-clay px-4 py-3 text-[13px] font-bold text-ink transition-opacity disabled:opacity-45"
        >
          {pending ? 'Submitting…' : 'Submit gym'}
        </button>
      </form>
    </SubmitShell>
  );
}
