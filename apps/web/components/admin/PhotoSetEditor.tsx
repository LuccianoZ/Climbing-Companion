'use client';

import { useState } from 'react';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import {
  MIN_SUBMISSION_PHOTOS,
  type MediaAsset,
  type MediaPurpose,
  type SubmissionPhotoView,
} from '@/lib/types';

// AR-51 BL-x07: the admin editor's photo section. Shows the photos currently
// attached, lets the admin remove any of them and upload new ones, and hands
// the parent the full desired id list. The set may not drop below 3 (the
// server enforces this too).
//
// Removing here is a soft detach on save (the media_assets row survives);
// nothing is deleted until the parent PATCHes the new set.

interface Entry {
  id: string;
  // 'existing' rows render from GET /api/media/:id; 'new' rows are freshly
  // uploaded this session.
  source: 'existing' | 'new';
  moderationStatus?: string;
}

export function PhotoSetEditor({
  purpose,
  existing,
  onChange,
  disabled = false,
}: {
  purpose: MediaPurpose;
  existing: SubmissionPhotoView[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    existing.map((p) => ({
      id: p.id,
      source: 'existing' as const,
      moderationStatus: p.moderationStatus,
    })),
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<MediaAsset | null>(null);

  function publish(next: Entry[]) {
    setEntries(next);
    onChange(next.map((e) => e.id));
  }

  function remove(id: string) {
    publish(entries.filter((e) => e.id !== id));
  }

  function commitDraft() {
    if (!draft) return;
    publish([...entries, { id: draft.id, source: 'new' }]);
    setDraft(null);
    setAdding(false);
  }

  const belowFloor = entries.length < MIN_SUBMISSION_PHOTOS;

  return (
    <fieldset className="space-y-2.5" data-testid="photo-set-editor">
      <legend className="label-caps text-caption text-ink-faint">
        Photos ({entries.length}) — minimum {MIN_SUBMISSION_PHOTOS}
      </legend>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            data-testid="photo-set-item"
            data-photo-id={entry.id}
            data-photo-source={entry.source}
            className="relative overflow-hidden rounded-control border border-line bg-paper"
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                served copy is byte-identical and next/image can't optimise
                the auth-gated media endpoint. */}
            <img
              src={`/api/media/${entry.id}`}
              alt=""
              className="aspect-square w-full object-cover"
            />
            {entry.source === 'new' ? (
              <span className="absolute left-1 top-1 rounded bg-ink px-1 py-[1px] text-caption font-bold text-paper">
                NEW
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Remove photo"
              data-testid="photo-set-remove"
              disabled={disabled}
              onClick={() => remove(entry.id)}
              className="absolute right-1 top-1 rounded-full border border-line bg-surface px-1.5 text-caption font-bold text-clay-deep"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {belowFloor ? (
        <p
          data-testid="photo-set-below-floor"
          className="text-caption font-semibold text-clay-deep"
        >
          Add {MIN_SUBMISSION_PHOTOS - entries.length} more — a gym or climb has
          to keep at least {MIN_SUBMISSION_PHOTOS}.
        </p>
      ) : null}

      {adding ? (
        <div className="space-y-2 rounded-control border border-dashed border-line p-2.5">
          <ImageUploadField
            purpose={purpose}
            label="Upload a new photo"
            asset={draft}
            onUploaded={setDraft}
            disabled={disabled}
          />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="photo-set-add-confirm"
              disabled={!draft || disabled}
              onClick={commitDraft}
              className="rounded-control border border-ink bg-ink px-3 py-1.5 text-caption font-bold text-paper disabled:opacity-45"
            >
              Add to set
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setAdding(false);
              }}
              className="rounded-control border border-line-soft px-3 py-1.5 text-caption text-ink-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="photo-set-add"
          disabled={disabled}
          onClick={() => setAdding(true)}
          className="rounded-control border border-dashed border-line px-3 py-2 text-caption font-semibold text-ink-soft"
        >
          + Add a photo
        </button>
      )}
    </fieldset>
  );
}
