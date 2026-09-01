'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { FormError, TextField } from '@/components/auth/fields';
import { CheckIcon } from '@/components/shell/icons';
import { submitGym } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { useViewerLocation } from '@/lib/use-viewer-location';
import type { SubmitGymInput, SubmitGymResult } from '@/lib/types';
import { LocationPicker, type LatLng } from './LocationPicker';
import { SubmitShell } from './SubmitShell';

// BL-007. Much simpler than a route by design, not by omission: Foundation
// section 4 makes a gym a standalone pin with no child routes, no discipline,
// no gear and no grade. The disciplines it offers are not asked for here --
// they are the union of what its four verifiers report (BL-011), or an
// admin's direct entry (BL-012), so collecting them at submission time would
// create a second, unreconciled source for a column the verification pipeline
// owns.

const FALLBACK_POINT: LatLng = { latitude: 37.7338, longitude: -119.5676 };

export function SubmitGymForm() {
  const viewerState = useViewerLocation();
  const viewer =
    viewerState.status === 'ready'
      ? { latitude: viewerState.latitude, longitude: viewerState.longitude }
      : null;

  const [name, setName] = useState('');
  const [pick, setPick] = useState<LatLng | null>(null);
  const [usedGpsFix, setUsedGpsFix] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitGymResult | null>(null);

  const point: LatLng = pick ?? viewer ?? FALLBACK_POINT;
  const placed = pick !== null || (usedGpsFix && viewer !== null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!name.trim()) {
      errors.name = 'Give the gym a name.';
    }
    if (!placed) {
      errors.location = 'Place the pin on the gym before submitting.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload: SubmitGymInput = {
      name: name.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
    };

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
    return (
      <SubmitShell
        title="Gym submitted"
        subtitle="It is on the map now, waiting for four climbers to verify it."
      >
        <div data-testid="submit-gym-success" className="card-raised space-y-4 p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-moss-deep">
            <CheckIcon className="h-4 w-4" />
            {result.name} is live
          </p>
          <p className="text-[12px] leading-relaxed text-ink-soft">
            The disciplines it offers get filled in by its fourth verification —
            each verifier reports what they saw, and the gym lists the union.
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
      subtitle="A gym is a standalone pin — just a name and where it is."
    >
      <form
        noValidate
        onSubmit={onSubmit}
        data-testid="submit-gym-form"
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
