'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TextField } from '@/components/auth/fields';
import {
  OperatingHoursEditor,
  defaultOperatingHours,
} from '@/components/submit/OperatingHoursEditor';
import { PhotoSetEditor } from './PhotoSetEditor';
import {
  ChangeDiffModal,
  DeleteEntityModal,
  type FieldChange,
} from './StewardshipModals';
import {
  adminUpdateGym,
  adminUpdateRoute,
  fetchAdminGym,
  fetchAdminRoute,
  forceArchiveGym,
  forceArchiveRoute,
  hardDeleteGym,
  hardDeleteRoute,
  restoreGym,
  restoreRoute,
} from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { gradeOptions } from '@/lib/grades';
import {
  DISCIPLINE_LABELS,
  GEAR_REQUIREMENTS,
  GEAR_REQUIREMENT_LABELS,
  GYM_DISCIPLINES,
  GYM_DISCIPLINE_LABELS,
  OUTDOOR_DISCIPLINES,
  WEEKDAY_SHORT,
  type AdminGymView,
  type AdminRouteView,
  type GearRequirement,
  type GymDiscipline,
  type OperatingHours,
  type OutdoorDiscipline,
  type SubmissionPhotoView,
} from '@/lib/types';

// AR-51 BL-x07 / §14: the shared gym / climb editor. Prefilled from the
// admin read; every displayed field is editable, including the photo set.
// "Save" opens a before/after diff that requires typing SAVE; "Remove" opens
// the archive-or-delete gate (delete requires typing DELETE).

type Kind = 'gym' | 'route';

interface GymForm {
  name: string;
  lat: string;
  lng: string;
  disciplines: GymDiscipline[];
  hours: OperatingHours;
  photoIds: string[];
}

interface RouteForm {
  name: string;
  lat: string;
  lng: string;
  discipline: OutdoorDiscipline;
  gear: GearRequirement[];
  summary: string;
  gradeOrdinal: number;
  boltCount: string;
  minRopeLengthM: string;
  photoIds: string[];
}

function summariseHours(hours: OperatingHours): string {
  return WEEKDAY_SHORT.map((label, day) => {
    const ranges = hours[String(day)] ?? [];
    if (ranges.length === 0) return `${label} closed`;
    if (ranges.length === 1 && ranges[0].fullDay) return `${label} 24h`;
    return `${label} ${ranges.map((r) => `${r.opens}-${r.closes}`).join('/')}`;
  }).join(', ');
}

export function EntityEditor({ kind, id }: { kind: Kind; id: string }) {
  const [gym, setGym] = useState<AdminGymView | null>(null);
  const [route, setRoute] = useState<AdminRouteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [gymForm, setGymForm] = useState<GymForm | null>(null);
  const [routeForm, setRouteForm] = useState<RouteForm | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  // Bumped after a successful mutation to re-fetch the canonical state.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const run =
      kind === 'gym'
        ? fetchAdminGym(id, controller.signal)
        : fetchAdminRoute(id, controller.signal);

    run
      .then((data) => {
        if (kind === 'gym') {
          const g = data as AdminGymView;
          setGym(g);
          setGymForm({
            name: g.name,
            lat: g.latitude.toFixed(6),
            lng: g.longitude.toFixed(6),
            disciplines: g.disciplinesOffered,
            hours: g.operatingHours ?? defaultOperatingHours(),
            photoIds: g.photos.map((p) => p.id),
          });
        } else {
          const r = data as AdminRouteView;
          setRoute(r);
          setRouteForm({
            name: r.name,
            lat: r.latitude.toFixed(6),
            lng: r.longitude.toFixed(6),
            discipline: r.discipline,
            gear: r.gearRequirements,
            summary: r.summary,
            gradeOrdinal: r.proposedGradeOrdinal,
            boltCount: r.boltCount === null ? '' : String(r.boltCount),
            minRopeLengthM:
              r.minRopeLengthM === null ? '' : String(r.minRopeLengthM),
            photoIds: r.photos.map((p) => p.id),
          });
        }
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoadError(messageFor('ADMIN_READ', err));
      });
    return () => controller.abort();
  }, [kind, id, reloadKey]);

  const changes: FieldChange[] = useMemo(() => {
    if (kind === 'gym' && gym && gymForm) {
      return gymChanges(gym, gymForm);
    }
    if (kind === 'route' && route && routeForm) {
      return routeChanges(route, routeForm);
    }
    return [];
  }, [kind, gym, gymForm, route, routeForm]);

  const status = kind === 'gym' ? gym?.status : route?.status;
  const entityName = kind === 'gym' ? gym?.name : route?.name;

  async function applyChanges() {
    setPending(true);
    setError(null);
    try {
      if (kind === 'gym' && gym && gymForm) {
        await adminUpdateGym(id, {
          name: gymForm.name.trim(),
          latitude: Number(gymForm.lat),
          longitude: Number(gymForm.lng),
          disciplinesOffered: gymForm.disciplines,
          operatingHours: gymForm.hours,
          photoMediaIds: gymForm.photoIds,
        });
      } else if (kind === 'route' && route && routeForm) {
        await adminUpdateRoute(id, {
          name: routeForm.name.trim(),
          latitude: Number(routeForm.lat),
          longitude: Number(routeForm.lng),
          discipline: routeForm.discipline,
          gearRequirements: routeForm.gear,
          summary: routeForm.summary.trim(),
          proposedGradeOrdinal: routeForm.gradeOrdinal,
          boltCount:
            routeForm.discipline === 'BOULDERING' || routeForm.boltCount === ''
              ? null
              : Number(routeForm.boltCount),
          minRopeLengthM:
            routeForm.discipline === 'BOULDERING' ||
            routeForm.minRopeLengthM === ''
              ? null
              : Number(routeForm.minRopeLengthM),
          photoMediaIds: routeForm.photoIds,
        });
      }
      setShowDiff(false);
      setFlash('Changes applied. They are live on the map now.');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(messageFor('ADMIN_UPDATE', err));
      setShowDiff(false);
    } finally {
      setPending(false);
    }
  }

  async function run(
    action: () => Promise<unknown>,
    onOk: string,
    errAction: 'FORCE_ARCHIVE' | 'RESTORE_ENTITY' | 'DELETE_ENTITY',
    removed = false,
  ) {
    setPending(true);
    setError(null);
    try {
      await action();
      setShowDelete(false);
      if (removed) {
        setGone(onOk);
      } else {
        setFlash(onOk);
        setReloadKey((k) => k + 1);
      }
    } catch (err) {
      setError(messageFor(errAction, err));
    } finally {
      setPending(false);
    }
  }

  if (loadError) {
    return (
      <p
        data-testid="entity-editor-error"
        className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
      >
        {loadError}
      </p>
    );
  }

  if (gone) {
    return (
      <div data-testid="entity-editor-gone" className="card max-w-xl space-y-3 p-4">
        <p className="text-[13.5px] font-bold text-clay-deep">{gone}</p>
        <Link
          href="/admin/stewardship"
          className="inline-block rounded-[8px] border-[1.5px] border-ink bg-ink px-3.5 py-2 text-[12px] font-semibold text-paper"
        >
          Back to search
        </Link>
      </div>
    );
  }

  if ((kind === 'gym' && !gymForm) || (kind === 'route' && !routeForm)) {
    return (
      <p data-testid="entity-editor-loading" className="text-[12px] text-ink-faint">
        Loading…
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4" data-testid="entity-editor" data-kind={kind}>
      {flash ? (
        <p
          data-testid="entity-editor-flash"
          className="rounded-[8px] border-[1.5px] border-moss-deep bg-moss-wash px-3 py-2 text-[12px] text-moss-deep"
        >
          {flash}
        </p>
      ) : null}

      {status === 'ARCHIVED' ? (
        <p
          data-testid="entity-editor-archived"
          className="rounded-[8px] border-[1.5px] border-line-soft bg-paper px-3 py-2 text-[11.5px] italic text-ink-soft"
        >
          This entity is archived (hidden from the map). Editing still works;
          use Remove → Restore to bring it back.
        </p>
      ) : null}

      {kind === 'route' && route?.isFoundingRoute ? (
        <p
          data-testid="entity-editor-founding"
          className="rounded-[8px] border-[1.5px] border-line-soft bg-paper px-3 py-2 text-[11.5px] text-ink-soft"
        >
          This is the founding route of crag{' '}
          <span className="font-semibold">{route.cragName}</span>. Its lifecycle
          drives the crag&apos;s.
        </p>
      ) : null}

      <div className="card space-y-4 p-4">
        {kind === 'gym' && gymForm && gym ? (
          <GymFields
            form={gymForm}
            onChange={setGymForm}
            existingPhotos={gym.photos}
            disabled={pending}
          />
        ) : null}
        {kind === 'route' && routeForm && route ? (
          <RouteFields
            form={routeForm}
            onChange={setRouteForm}
            existingPhotos={route.photos}
            disabled={pending}
          />
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="entity-editor-form-error"
          className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="entity-editor-save"
          disabled={pending || changes.length === 0}
          onClick={() => setShowDiff(true)}
          className="rounded-[8px] border-[1.5px] border-ink bg-ink px-4 py-2 text-[12px] font-bold text-paper disabled:opacity-45"
        >
          {changes.length === 0
            ? 'No changes'
            : `Review & save (${changes.length})`}
        </button>
        <button
          type="button"
          data-testid="entity-editor-remove"
          disabled={pending}
          onClick={() => setShowDelete(true)}
          className="rounded-[8px] border-[1.5px] border-clay-deep px-4 py-2 text-[12px] font-semibold text-clay-deep"
        >
          Remove from map…
        </button>
      </div>

      {showDiff ? (
        <ChangeDiffModal
          changes={changes}
          pending={pending}
          onConfirm={applyChanges}
          onCancel={() => setShowDiff(false)}
        />
      ) : null}

      {showDelete && status && entityName ? (
        <DeleteEntityModal
          entityName={entityName}
          status={status}
          cascadeNote={
            kind === 'route' && route?.isFoundingRoute
              ? `Deleting this founding route permanently also deletes crag "${route.cragName}" and every other route under it.`
              : undefined
          }
          pending={pending}
          onArchive={() =>
            run(
              () => (kind === 'gym' ? forceArchiveGym(id) : forceArchiveRoute(id)),
              'Archived — hidden from the map. Restore it any time.',
              'FORCE_ARCHIVE',
            )
          }
          onRestore={() =>
            run(
              () => (kind === 'gym' ? restoreGym(id) : restoreRoute(id)),
              'Restored to the map as unverified.',
              'RESTORE_ENTITY',
            )
          }
          onDelete={() =>
            run(
              () => (kind === 'gym' ? hardDeleteGym(id) : hardDeleteRoute(id)),
              `"${entityName}" has been permanently deleted.`,
              'DELETE_ENTITY',
              true,
            )
          }
          onCancel={() => setShowDelete(false)}
        />
      ) : null}
    </div>
  );
}

// --- field groups --------------------------------------------------------

function GymFields({
  form,
  onChange,
  existingPhotos,
  disabled,
}: {
  form: GymForm;
  onChange: (next: GymForm) => void;
  existingPhotos: SubmissionPhotoView[];
  disabled: boolean;
}) {
  const set = <K extends keyof GymForm>(key: K, value: GymForm[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <>
      <TextField
        label="Name"
        name="name"
        value={form.name}
        onChange={(v) => set('name', v)}
        maxLength={100}
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Latitude"
          name="lat"
          value={form.lat}
          onChange={(v) => set('lat', v)}
        />
        <TextField
          label="Longitude"
          name="lng"
          value={form.lng}
          onChange={(v) => set('lng', v)}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="label-caps text-[9.5px] text-ink-faint">
          Disciplines offered
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GYM_DISCIPLINES.map((item) => {
            const checked = form.disciplines.includes(item);
            return (
              <label
                key={item}
                data-testid={`editor-gym-discipline-${item}`}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-[8px] border-[1.5px] px-2.5 py-2 text-[11.5px] font-medium',
                  checked
                    ? 'border-ink bg-paper text-ink'
                    : 'border-line-soft bg-surface text-ink-soft',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    set(
                      'disciplines',
                      checked
                        ? form.disciplines.filter((d) => d !== item)
                        : [...form.disciplines, item],
                    )
                  }
                  className="h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
                />
                {GYM_DISCIPLINE_LABELS[item]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <OperatingHoursEditor
        value={form.hours}
        onChange={(next) => set('hours', next)}
        disabled={disabled}
      />
      <PhotoSetEditor
        purpose="GYM_SUBMISSION_PHOTO"
        existing={existingPhotos}
        onChange={(ids) => set('photoIds', ids)}
        disabled={disabled}
      />
    </>
  );
}

function RouteFields({
  form,
  onChange,
  existingPhotos,
  disabled,
}: {
  form: RouteForm;
  onChange: (next: RouteForm) => void;
  existingPhotos: SubmissionPhotoView[];
  disabled: boolean;
}) {
  const set = <K extends keyof RouteForm>(key: K, value: RouteForm[K]) =>
    onChange({ ...form, [key]: value });
  const rope = form.discipline !== 'BOULDERING';

  return (
    <>
      <TextField
        label="Name"
        name="name"
        value={form.name}
        onChange={(v) => set('name', v)}
        maxLength={100}
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Latitude"
          name="lat"
          value={form.lat}
          onChange={(v) => set('lat', v)}
        />
        <TextField
          label="Longitude"
          name="lng"
          value={form.lng}
          onChange={(v) => set('lng', v)}
        />
      </div>

      <div className="space-y-1.5">
        <span className="label-caps block text-[9.5px] text-ink-faint">
          Discipline
        </span>
        <div className="grid grid-cols-3 gap-2">
          {OUTDOOR_DISCIPLINES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === form.discipline}
              data-testid={`editor-discipline-${option}`}
              disabled={disabled}
              onClick={() => onChange({ ...form, discipline: option, gradeOrdinal: 0 })}
              className={[
                'rounded-[10px] border-[1.5px] px-2 py-2 text-[11px] font-bold',
                option === form.discipline
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-surface text-ink',
              ].join(' ')}
            >
              {DISCIPLINE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="label-caps block text-[9.5px] text-ink-faint">
          Proposed grade
        </span>
        <select
          value={form.gradeOrdinal}
          disabled={disabled}
          onChange={(e) => set('gradeOrdinal', Number(e.target.value))}
          className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[13px] text-ink"
        >
          {gradeOptions(form.discipline, 'YOSEMITE').map((option) => (
            <option key={option.ordinal} value={option.ordinal}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {rope ? (
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Bolt count"
            name="boltCount"
            value={form.boltCount}
            onChange={(v) => set('boltCount', v)}
          />
          <TextField
            label="Min rope (m)"
            name="minRopeLengthM"
            value={form.minRopeLengthM}
            onChange={(v) => set('minRopeLengthM', v)}
          />
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="label-caps text-[9.5px] text-ink-faint">
          Gear needed
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {GEAR_REQUIREMENTS.map((item) => {
            const checked = form.gear.includes(item);
            return (
              <label
                key={item}
                data-testid={`editor-gear-${item}`}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-2.5 py-2 text-[11.5px] font-medium',
                  checked
                    ? 'border-ink bg-paper text-ink'
                    : 'border-line-soft bg-surface text-ink-soft',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    set(
                      'gear',
                      checked
                        ? form.gear.filter((g) => g !== item)
                        : [...form.gear, item],
                    )
                  }
                  className="h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
                />
                {GEAR_REQUIREMENT_LABELS[item]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="label-caps block text-[9.5px] text-ink-faint">
          Description &amp; beta
        </span>
        <textarea
          rows={4}
          maxLength={250}
          value={form.summary}
          disabled={disabled}
          onChange={(e) => set('summary', e.target.value)}
          className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink"
        />
      </label>

      <PhotoSetEditor
        purpose="ROUTE_SUBMISSION_PHOTO"
        existing={existingPhotos}
        onChange={(ids) => set('photoIds', ids)}
        disabled={disabled}
      />
    </>
  );
}

// --- diff ---------------------------------------------------------------

function photoDelta(before: string[], after: string[]): string | null {
  const b = new Set(before);
  const a = new Set(after);
  const added = after.filter((id) => !b.has(id)).length;
  const removed = before.filter((id) => !a.has(id)).length;
  if (added === 0 && removed === 0) return null;
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  return `${before.length} photo${before.length === 1 ? '' : 's'} → ${after.length} (${parts.join(', ')})`;
}

function gymChanges(original: AdminGymView, form: GymForm): FieldChange[] {
  const out: FieldChange[] = [];
  if (form.name.trim() !== original.name)
    out.push({ label: 'Name', before: original.name, after: form.name.trim() });
  if (
    Number(form.lat) !== original.latitude ||
    Number(form.lng) !== original.longitude
  )
    out.push({
      label: 'Coordinates',
      before: `${original.latitude.toFixed(5)}, ${original.longitude.toFixed(5)}`,
      after: `${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`,
    });
  const disBefore = [...original.disciplinesOffered].sort().join(', ');
  const disAfter = [...form.disciplines].sort().join(', ');
  if (disBefore !== disAfter)
    out.push({ label: 'Disciplines', before: disBefore, after: disAfter });
  const hoursBefore = summariseHours(original.operatingHours ?? {});
  const hoursAfter = summariseHours(form.hours);
  if (hoursBefore !== hoursAfter)
    out.push({ label: 'Hours', before: hoursBefore, after: hoursAfter });
  const pd = photoDelta(
    original.photos.map((p) => p.id),
    form.photoIds,
  );
  if (pd)
    out.push({
      label: 'Photos',
      before: `${original.photos.length}`,
      after: pd,
    });
  return out;
}

function routeChanges(original: AdminRouteView, form: RouteForm): FieldChange[] {
  const out: FieldChange[] = [];
  if (form.name.trim() !== original.name)
    out.push({ label: 'Name', before: original.name, after: form.name.trim() });
  if (
    Number(form.lat) !== original.latitude ||
    Number(form.lng) !== original.longitude
  )
    out.push({
      label: 'Coordinates',
      before: `${original.latitude.toFixed(5)}, ${original.longitude.toFixed(5)}`,
      after: `${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`,
    });
  if (form.discipline !== original.discipline)
    out.push({
      label: 'Discipline',
      before: DISCIPLINE_LABELS[original.discipline],
      after: DISCIPLINE_LABELS[form.discipline],
    });
  if (form.gradeOrdinal !== original.proposedGradeOrdinal)
    out.push({
      label: 'Grade ordinal',
      before: String(original.proposedGradeOrdinal),
      after: String(form.gradeOrdinal),
    });
  const gearBefore = [...original.gearRequirements].sort().join(', ');
  const gearAfter = [...form.gear].sort().join(', ');
  if (gearBefore !== gearAfter)
    out.push({ label: 'Gear', before: gearBefore, after: gearAfter });
  if (form.summary.trim() !== original.summary)
    out.push({
      label: 'Description',
      before: original.summary,
      after: form.summary.trim(),
    });
  const boltBefore = original.boltCount === null ? '' : String(original.boltCount);
  const boltAfter =
    form.discipline === 'BOULDERING' ? '' : form.boltCount.trim();
  if (boltBefore !== boltAfter)
    out.push({
      label: 'Bolt count',
      before: boltBefore || '—',
      after: boltAfter || '—',
    });
  const ropeBefore =
    original.minRopeLengthM === null ? '' : String(original.minRopeLengthM);
  const ropeAfter =
    form.discipline === 'BOULDERING' ? '' : form.minRopeLengthM.trim();
  if (ropeBefore !== ropeAfter)
    out.push({
      label: 'Min rope',
      before: ropeBefore || '—',
      after: ropeAfter || '—',
    });
  const pd = photoDelta(
    original.photos.map((p) => p.id),
    form.photoIds,
  );
  if (pd)
    out.push({
      label: 'Photos',
      before: `${original.photos.length}`,
      after: pd,
    });
  return out;
}
