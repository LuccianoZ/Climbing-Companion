'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { FormError, TextField } from '@/components/auth/fields';
import { CheckIcon } from '@/components/shell/icons';
import { MultiImageUploadField } from '@/components/media/MultiImageUploadField';
import { submitRoute } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { PROXIMITY_METERS } from '@/lib/geo';
import { gradeOptions } from '@/lib/grades';
import { useSession } from '@/lib/session';
import { useViewerLocation } from '@/lib/use-viewer-location';
import {
  acceptsRopeDetails,
  DISCIPLINE_LABELS,
  GEAR_REQUIREMENTS,
  GEAR_REQUIREMENT_LABELS,
  MIN_SUBMISSION_PHOTOS,
  OUTDOOR_DISCIPLINES,
  type GearRequirement,
  type MediaAsset,
  type OutdoorDiscipline,
  type SubmitRouteInput,
  type SubmitRouteResult,
} from '@/lib/types';
import { LocationPicker, type LatLng } from './LocationPicker';
import { SubmitShell } from './SubmitShell';

// BL-006. The form's whole job beyond collecting fields is to never let a
// climber fill it in and then be told no:
//
//   * Bolt count and minimum rope length render only for Sport and Trad. The
//     server forbids them outright for Bouldering -- a cross-field validator
//     in SubmitRouteDto, backed by a Postgres CHECK (Architecture section 3)
//     -- so a Bouldering submission that carried them would 400 after the
//     form was complete. Switching discipline to Bouldering therefore also
//     clears whatever was typed into them, and the keys are omitted from the
//     payload entirely rather than sent as nulls.
//   * The grade dropdown is clamped to the discipline's real scale (AR-35).
//   * Summary is capped at 250 characters, matching varchar(250), with the
//     remaining count visible rather than the input silently truncating.
//
// Crag creation is invisible here by design: Foundation section 4 has no
// "create a crag" action, so the submitter only learns afterwards whether
// their coordinates founded one or attached to a neighbour within 300m.

// Yosemite Valley -- the same fallback centre MapCanvas opens on. Only ever
// shown; never submitted, because `placed` gates the submit button until the
// climber has actually chosen a point.
const FALLBACK_POINT: LatLng = { latitude: 37.7338, longitude: -119.5676 };

const SUMMARY_MAX = 250;

export function SubmitRouteForm() {
  const { isAdmin } = useSession();
  const viewerState = useViewerLocation();
  const viewer =
    viewerState.status === 'ready'
      ? { latitude: viewerState.latitude, longitude: viewerState.longitude }
      : null;

  const [discipline, setDiscipline] = useState<OutdoorDiscipline>('SPORT_CLIMBING');
  const [name, setName] = useState('');
  const [gradeOrdinal, setGradeOrdinal] = useState<number | null>(null);
  const [pick, setPick] = useState<LatLng | null>(null);
  const [usedGpsFix, setUsedGpsFix] = useState(false);
  const [boltCount, setBoltCount] = useState('');
  const [minRopeLengthM, setMinRopeLengthM] = useState('');
  const [gear, setGear] = useState<GearRequirement[]>([]);
  const [summary, setSummary] = useState('');
  const [photos, setPhotos] = useState<MediaAsset[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitRouteResult | null>(null);

  // AR-27: derived during render from what is known, never copied into state
  // by an effect. A GPS fix arriving after mount changes `viewer`, which
  // changes this, without a set-state-in-effect anywhere.
  const point: LatLng = pick ?? (isAdmin ? FALLBACK_POINT : viewer ?? FALLBACK_POINT);
  const placed = isAdmin
    ? pick !== null
    : pick !== null || (usedGpsFix && viewer !== null);
  const ropeDiscipline = acceptsRopeDetails(discipline);
  // BL-x02: non-admin pin is locked to a 300m circle around the device.
  const constrainTo =
    !isAdmin && viewer
      ? { centre: viewer, radiusMeters: PROXIMITY_METERS }
      : null;

  function changeDiscipline(next: OutdoorDiscipline) {
    setDiscipline(next);
    setGradeOrdinal(null); // V-scale and rope-scale ordinals are not the same number.
    if (!acceptsRopeDetails(next)) {
      setBoltCount('');
      setMinRopeLengthM('');
    }
  }

  function toggleGear(item: GearRequirement) {
    setGear((current) =>
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    );
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Give the route a name.';
    }
    if (gradeOrdinal === null) {
      errors.grade = 'Pick a proposed grade.';
    }
    if (!isAdmin && !viewer) {
      errors.location =
        'Location access is needed to place a route within 300m of you.';
    }
    if (!placed) {
      errors.location = 'Place the pin on the route before submitting.';
    }
    if (!summary.trim()) {
      errors.summary = 'Add a short description — the crux, the holds, any hazards.';
    }
    if (photos.length < MIN_SUBMISSION_PHOTOS) {
      errors.photos = `Upload at least ${MIN_SUBMISSION_PHOTOS} photos of the route.`;
    }
    if (ropeDiscipline && boltCount.trim() && !/^\d+$/.test(boltCount.trim())) {
      errors.boltCount = 'Bolt count must be a whole number.';
    }
    if (
      ropeDiscipline &&
      minRopeLengthM.trim() &&
      !/^\d+$/.test(minRopeLengthM.trim())
    ) {
      errors.minRopeLengthM = 'Rope length must be a whole number of metres.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!validate() || gradeOrdinal === null) {
      return;
    }

    // Built key by key rather than spread-with-undefined: JSON.stringify drops
    // undefined values, but relying on that to satisfy a CHECK constraint is
    // the kind of thing that breaks quietly when the serialiser changes.
    const payload: SubmitRouteInput = {
      name: name.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
      discipline,
      summary: summary.trim(),
      proposedGradeOrdinal: gradeOrdinal,
      photoMediaIds: photos.map((p) => p.id),
    };
    if (gear.length > 0) {
      payload.gearRequirements = gear;
    }
    if (ropeDiscipline && boltCount.trim()) {
      payload.boltCount = Number(boltCount.trim());
    }
    if (ropeDiscipline && minRopeLengthM.trim()) {
      payload.minRopeLengthM = Number(minRopeLengthM.trim());
    }
    if (!isAdmin && viewer) {
      payload.deviceLatitude = viewer.latitude;
      payload.deviceLongitude = viewer.longitude;
    }

    setPending(true);
    try {
      setResult(await submitRoute(payload));
    } catch (error) {
      setFormError(messageFor('SUBMIT_ROUTE', error));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <SubmitShell
        title="Route submitted"
        subtitle="It is on the map now, waiting for four climbers to verify it."
      >
        <div data-testid="submit-route-success" className="card-raised space-y-4 p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-moss-deep">
            <CheckIcon className="h-4 w-4" />
            {result.route.name} is live
          </p>

          {/* The one part of BL-006's transaction worth surfacing: whether
              these coordinates founded a new crag or joined one already
              within 300m. It also explains the crag name, which the submitter
              never typed -- an auto-created crag borrows its founding route's
              name (AR-14). */}
          <p
            data-testid="crag-outcome"
            data-crag-created={result.cragCreated ? 'true' : 'false'}
            className="text-[12px] leading-relaxed text-ink-soft"
          >
            {result.cragCreated
              ? `No crag existed within 300m, so "${result.crag.name}" was created around this route. Verifying this route will verify the crag with it.`
              : `Added to the existing crag "${result.crag.name}".`}
          </p>

          <Link
            href={`/?kind=CRAG&id=${result.crag.id}&lat=${point.latitude}&lng=${point.longitude}&name=${encodeURIComponent(result.crag.name)}`}
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
      title="Submit new route"
      subtitle="Share a new line with the community. The discipline you pick adapts the form."
    >
      <form
        noValidate
        onSubmit={onSubmit}
        data-testid="submit-route-form"
        data-discipline={discipline}
        className="space-y-4"
      >
        <div
          role="group"
          aria-label="Discipline"
          className="grid grid-cols-3 gap-2"
        >
          {OUTDOOR_DISCIPLINES.map((option) => {
            const active = option === discipline;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                data-testid={`discipline-${option}`}
                onClick={() => changeDiscipline(option)}
                className={[
                  'rounded-[10px] border-[1.5px] px-2 py-2.5 text-[11px] font-bold leading-tight',
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-surface text-ink',
                ].join(' ')}
              >
                {DISCIPLINE_LABELS[option]}
              </button>
            );
          })}
        </div>

        <div className="card space-y-4 p-3.5">
          <TextField
            label="Route name *"
            name="name"
            value={name}
            onChange={setName}
            placeholder="e.g. The Pink One in the Corner"
            maxLength={100}
            error={fieldErrors.name}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="proposedGradeOrdinal"
              className="label-caps block text-[9.5px] text-ink-faint"
            >
              Grade *
            </label>
            <select
              id="proposedGradeOrdinal"
              name="proposedGradeOrdinal"
              data-testid="grade-select"
              value={gradeOrdinal ?? ''}
              onChange={(event) =>
                setGradeOrdinal(
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
              className={[
                'w-full rounded-[10px] border-[1.5px] bg-surface px-3 py-2.5 text-[13px] text-ink outline-none',
                fieldErrors.grade ? 'border-clay-deep' : 'border-line',
              ].join(' ')}
            >
              <option value="">Select grade</option>
              {gradeOptions(discipline, 'YOSEMITE').map((option) => (
                <option key={option.ordinal} value={option.ordinal}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-[10.5px] text-ink-faint">
              Your estimate. It is shown as the Proposed Grade until four
              climbers have voted.
            </p>
            {fieldErrors.grade ? (
              <p
                data-testid="field-error-proposedGradeOrdinal"
                className="text-[10.5px] text-clay-deep"
              >
                {fieldErrors.grade}
              </p>
            ) : null}
          </div>

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

          {/* Sport and Trad only. Not merely disabled for Bouldering --
              removed, because the server does not accept the fields at all
              there and a greyed-out box invites "why can't I fill this in?" */}
          {ropeDiscipline ? (
            <fieldset
              data-testid="rope-details"
              className="space-y-3 rounded-[12px] border-[1.5px] border-dashed border-line p-3"
            >
              <legend className="label-caps px-1 text-[9px] text-ink-faint">
                Rope details (optional)
              </legend>
              <TextField
                label="Bolt count"
                name="boltCount"
                value={boltCount}
                onChange={setBoltCount}
                placeholder="e.g. 12"
                error={fieldErrors.boltCount}
              />
              <TextField
                label="Min rope length (m)"
                name="minRopeLengthM"
                value={minRopeLengthM}
                onChange={setMinRopeLengthM}
                placeholder="e.g. 60"
                error={fieldErrors.minRopeLengthM}
              />
            </fieldset>
          ) : null}

          {/* BL-023 / AR-33: named checkboxes, no icons. Optional by design --
              AR-14 reads gear_requirements' '{}' default as "optional,
              defaults empty", and a bolted face climb needing no rack is a
              legitimate empty answer. */}
          <fieldset data-testid="gear-requirements" className="space-y-2">
            <legend className="label-caps text-[9.5px] text-ink-faint">
              Gear needed (optional)
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {GEAR_REQUIREMENTS.map((item) => {
                const checked = gear.includes(item);
                return (
                  <label
                    key={item}
                    data-testid={`gear-option-${item}`}
                    className={[
                      'flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-2.5 py-2 text-[11.5px] font-medium',
                      checked
                        ? 'border-ink bg-paper text-ink'
                        : 'border-line-soft bg-surface text-ink-soft',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      name="gearRequirements"
                      value={item}
                      checked={checked}
                      onChange={() => toggleGear(item)}
                      className="h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
                    />
                    {GEAR_REQUIREMENT_LABELS[item]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label
              htmlFor="summary"
              className="label-caps block text-[9.5px] text-ink-faint"
            >
              Description &amp; beta *
            </label>
            <textarea
              id="summary"
              name="summary"
              rows={4}
              maxLength={SUMMARY_MAX}
              value={summary}
              placeholder="Describe the crux, the holds, or any danger zones…"
              onChange={(event) => setSummary(event.target.value)}
              className={[
                'w-full rounded-[10px] border-[1.5px] bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint',
                fieldErrors.summary ? 'border-clay-deep' : 'border-line',
              ].join(' ')}
            />
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10.5px] text-clay-deep">
                {fieldErrors.summary ?? ''}
              </p>
              <p
                data-testid="summary-remaining"
                className="shrink-0 text-[10.5px] text-ink-faint"
              >
                {SUMMARY_MAX - summary.length} left
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <MultiImageUploadField
              purpose="ROUTE_SUBMISSION_PHOTO"
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
          data-testid="submit-route"
          disabled={pending}
          className="w-full rounded-[10px] border-[1.5px] border-clay-deep bg-clay px-4 py-3 text-[13px] font-bold text-ink transition-opacity disabled:opacity-45"
        >
          {pending ? 'Submitting…' : 'Submit route'}
        </button>
      </form>
    </SubmitShell>
  );
}
