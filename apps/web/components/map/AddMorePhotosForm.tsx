'use client';

import { useState } from 'react';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import * as api from '@/lib/api';
import { messageFor } from '@/lib/errors';
import type { MediaAsset, MediaPurpose } from '@/lib/types';

// AR-54 (Sept 7, 2026): the original submitter adds more photos to their own
// gym or climb after the fact, no cap beyond the >= 3 already required at
// submission. Only rendered by the caller when the viewer IS the submitter
// (GymBody/RouteCard check `viewerUserId === detail.submittedBy`) -- the
// server enforces the same check independently either way.
//
// Reuses ImageUploadField as-is (BL-008's full upload round trip): one photo
// at a time, immediately linked via POST /:id/photos on a successful
// upload, then the field resets so another can be added. Unlike
// MultiImageUploadField (the >= 3-at-once submission flow), there is no
// minimum or cap here.
export function AddMorePhotosForm({
  kind,
  entityId,
}: {
  kind: 'GYM' | 'ROUTE';
  entityId: string;
}) {
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  const purpose: MediaPurpose =
    kind === 'GYM' ? 'GYM_SUBMISSION_PHOTO' : 'ROUTE_SUBMISSION_PHOTO';

  async function onUploaded(uploaded: MediaAsset | null) {
    setAsset(uploaded);
    setError(null);
    if (!uploaded) {
      setStatus('idle');
      return;
    }

    setStatus('saving');
    try {
      if (kind === 'GYM') {
        await api.addGymPhotos(entityId, [uploaded.id]);
      } else {
        await api.addRoutePhotos(entityId, [uploaded.id]);
      }
      setStatus('saved');
      // Reset so the field is ready for another photo -- the just-added one
      // stays PENDING until an admin approves it, so it won't appear in the
      // gallery above just yet.
      setAsset(null);
    } catch (uploadError) {
      setStatus('error');
      setError(messageFor('ADD_PHOTOS', uploadError));
    }
  }

  return (
    <div
      data-testid="add-more-photos"
      className="space-y-2 rounded-card border border-dashed border-line-soft p-3"
    >
      <p className="label-caps text-caption text-ink-faint">Add more photos</p>
      <ImageUploadField
        purpose={purpose}
        label="Add a photo"
        hint="Enters the moderation queue like any upload"
        asset={asset}
        onUploaded={(uploaded) => void onUploaded(uploaded)}
        disabled={status === 'saving'}
      />
      {status === 'saved' ? (
        <p
          data-testid="add-more-photos-success"
          className="text-caption font-medium text-moss-deep"
        >
          Photo added — pending admin approval.
        </p>
      ) : null}
      {status === 'error' && error ? (
        <p role="alert" className="text-caption text-clay-deep">
          {error}
        </p>
      ) : null}
    </div>
  );
}
