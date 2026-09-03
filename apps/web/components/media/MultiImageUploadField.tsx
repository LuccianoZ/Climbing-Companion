'use client';

import { useState } from 'react';
import { PlusIcon } from '@/components/shell/icons';
import { ImageUploadField } from './ImageUploadField';
import {
  MIN_SUBMISSION_PHOTOS,
  type MediaAsset,
  type MediaPurpose,
} from '@/lib/types';

// AR-51 BL-x04/x05: gym and outdoor-climb submissions now carry >= 3 photos.
// This wraps ImageUploadField (BL-008's single-upload round trip) into a
// growable list: each slot is an independent upload, and the parent form
// gets the resulting media_asset ids back. Slots past the minimum are
// optional and can be removed; a filled slot can be swapped in place.
//
// A hard cap keeps a mis-tap from turning into an upload storm on a phone
// uplink at a crag.
const MAX_SUBMISSION_PHOTOS = 8;

let nextSlotId = 0;

interface Slot {
  key: number;
  asset: MediaAsset | null;
}

export function MultiImageUploadField({
  purpose,
  assets,
  onChange,
  disabled = false,
}: {
  purpose: MediaPurpose;
  assets: MediaAsset[];
  onChange: (assets: MediaAsset[]) => void;
  disabled?: boolean;
}) {
  // Slots are local; `assets` (derived from them) is what the form reads.
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: MIN_SUBMISSION_PHOTOS }, () => ({
      key: nextSlotId++,
      asset: null,
    })),
  );

  function publish(next: Slot[]) {
    setSlots(next);
    onChange(next.map((s) => s.asset).filter((a): a is MediaAsset => a !== null));
  }

  function setSlotAsset(key: number, asset: MediaAsset | null) {
    publish(slots.map((s) => (s.key === key ? { ...s, asset } : s)));
  }

  function addSlot() {
    if (slots.length >= MAX_SUBMISSION_PHOTOS) return;
    publish([...slots, { key: nextSlotId++, asset: null }]);
  }

  function removeSlot(key: number) {
    if (slots.length <= MIN_SUBMISSION_PHOTOS) return;
    publish(slots.filter((s) => s.key !== key));
  }

  const uploaded = assets.length;
  const enough = uploaded >= MIN_SUBMISSION_PHOTOS;

  return (
    <fieldset className="space-y-2.5" data-testid="submission-photos">
      <legend className="label-caps text-[9.5px] text-ink-faint">
        Photos * (at least {MIN_SUBMISSION_PHOTOS})
      </legend>

      <p
        data-testid="submission-photo-count"
        data-enough={enough ? 'true' : 'false'}
        className={[
          'text-[10.5px] font-semibold',
          enough ? 'text-moss-deep' : 'text-ink-soft',
        ].join(' ')}
      >
        {uploaded} of {MIN_SUBMISSION_PHOTOS} minimum uploaded
      </p>

      <div className="space-y-2">
        {slots.map((slot, index) => (
          <div
            key={slot.key}
            data-testid={`submission-photo-slot-${index}`}
            className="flex items-start gap-2"
          >
            <div className="min-w-0 flex-1">
              <ImageUploadField
                purpose={purpose}
                label={`Photo ${index + 1}`}
                hint="Max 5MB (JPEG or PNG only)"
                asset={slot.asset}
                onUploaded={(asset) => setSlotAsset(slot.key, asset)}
                disabled={disabled}
              />
            </div>
            {slots.length > MIN_SUBMISSION_PHOTOS ? (
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                data-testid={`submission-photo-remove-${index}`}
                onClick={() => removeSlot(slot.key)}
                disabled={disabled}
                className="mt-1 shrink-0 rounded-full border border-line-soft px-2 py-2 text-[10px] text-ink-soft"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {slots.length < MAX_SUBMISSION_PHOTOS ? (
        <button
          type="button"
          data-testid="submission-photo-add"
          onClick={addSlot}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-line px-3 py-2 text-[11px] font-semibold text-ink-soft"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add another photo
        </button>
      ) : null}
    </fieldset>
  );
}
