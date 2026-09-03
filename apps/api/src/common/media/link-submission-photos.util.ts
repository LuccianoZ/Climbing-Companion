import { BadRequestException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../../media/entities/media-asset.entity';

// Foundation Revision Sept 3 2026 (AR-51, BL-x04/BL-x05): the shared step
// that attaches >= 3 pre-uploaded photos to a freshly-created gym or route.
//
// Photos are uploaded first through the existing BL-008 gateway
// (POST /api/media, purpose = ROUTE_SUBMISSION_PHOTO / GYM_SUBMISSION_PHOTO),
// which returns their ids; the submission DTO carries those ids and the
// submit transaction calls this to stamp the subject FK onto each row. It
// runs INSIDE the caller's transaction so a bad photo set rolls the whole
// submission back.
//
// Validation (all -> 400, the submission never persists):
//   - every id resolves to a real media_assets row;
//   - every row is owned by the submitter (you cannot attach someone
//     else's upload);
//   - every row carries the expected *_SUBMISSION_PHOTO purpose;
//   - no row is already attached to a subject (single-use).
//
// `approve` is true only on the admin-authoring path (BL-x03): admin photos
// publish immediately, bypassing the §10 pending queue. A community
// submission leaves them PENDING -- the "Photos pending admin approval"
// panel state is "zero APPROVED rows for this subject".

export interface LinkSubmissionPhotosParams {
  manager: EntityManager;
  mediaIds: string[];
  ownerUserId: string;
  purpose:
    MediaPurpose.ROUTE_SUBMISSION_PHOTO | MediaPurpose.GYM_SUBMISSION_PHOTO;
  subjectRouteId?: string;
  subjectGymId?: string;
  approve: boolean;
}

export const MIN_SUBMISSION_PHOTOS = 3;

export async function linkSubmissionPhotos(
  params: LinkSubmissionPhotosParams,
): Promise<MediaAsset[]> {
  const {
    manager,
    mediaIds,
    ownerUserId,
    purpose,
    subjectRouteId,
    subjectGymId,
    approve,
  } = params;

  // De-dupe defensively -- the DTO's @ArrayMinSize counts entries, not
  // distinct ids.
  const uniqueIds = [...new Set(mediaIds)];
  if (uniqueIds.length < MIN_SUBMISSION_PHOTOS) {
    throw new BadRequestException(
      `A submission requires at least ${MIN_SUBMISSION_PHOTOS} distinct photos`,
    );
  }

  const repo = manager.getRepository(MediaAsset);
  const assets = await repo.find({ where: { id: In(uniqueIds) } });

  if (assets.length !== uniqueIds.length) {
    throw new BadRequestException(
      'One or more photo ids do not resolve to an uploaded image',
    );
  }

  for (const asset of assets) {
    if (asset.ownerUserId !== ownerUserId) {
      throw new BadRequestException(
        'A submission photo must have been uploaded by the submitter',
      );
    }
    if (asset.purpose !== purpose) {
      throw new BadRequestException(
        `Photo "${asset.id}" was not uploaded with purpose ${purpose}`,
      );
    }
    if (asset.subjectRouteId || asset.subjectGymId) {
      throw new BadRequestException(
        `Photo "${asset.id}" is already attached to another submission`,
      );
    }
  }

  for (const asset of assets) {
    asset.subjectRouteId = subjectRouteId ?? null;
    asset.subjectGymId = subjectGymId ?? null;
    if (approve) {
      asset.moderationStatus = MediaModerationStatus.APPROVED;
    }
  }

  return repo.save(assets);
}

export interface SubmissionPhotoView {
  id: string;
  mimeType: string;
  byteSize: number;
  moderationStatus: MediaModerationStatus;
  createdAt: string;
}

// Every photo currently attached to a gym or route, for the admin editor
// and the detail-panel gallery.
export async function listSubmissionPhotos(
  manager: EntityManager,
  subject: { routeId?: string; gymId?: string },
): Promise<SubmissionPhotoView[]> {
  const repo = manager.getRepository(MediaAsset);
  const where = subject.routeId
    ? { subjectRouteId: subject.routeId }
    : { subjectGymId: subject.gymId };
  const rows = await repo.find({ where, order: { createdAt: 'ASC' } });
  return rows.map((r) => ({
    id: r.id,
    mimeType: r.mimeType,
    byteSize: r.byteSize,
    moderationStatus: r.moderationStatus,
    createdAt: r.createdAt.toISOString(),
  }));
}

// AR-51 BL-x07 (Sept 3 admin-stewardship extension): reconcile the photos
// attached to an existing gym/route to a new desired set. `desiredIds` is
// the full list the admin wants attached afterwards.
//
//   - ids newly present  -> linked (subject FK stamped, purpose checked,
//     admin's own upload, and -- since an admin edit publishes without the
//     §10 queue -- APPROVED);
//   - ids no longer present -> UNLINKED (subject FK nulled), never
//     hard-deleted (the media_assets row and its moderation history survive);
//   - the set may not fall below MIN_SUBMISSION_PHOTOS.
//
// Runs inside the caller's transaction.
export async function syncSubmissionPhotos(params: {
  manager: EntityManager;
  desiredIds: string[];
  ownerUserId: string;
  purpose:
    MediaPurpose.ROUTE_SUBMISSION_PHOTO | MediaPurpose.GYM_SUBMISSION_PHOTO;
  subjectRouteId?: string;
  subjectGymId?: string;
}): Promise<void> {
  const { manager, ownerUserId, purpose, subjectRouteId, subjectGymId } =
    params;
  const desiredIds = [...new Set(params.desiredIds)];

  if (desiredIds.length < MIN_SUBMISSION_PHOTOS) {
    throw new BadRequestException(
      `A gym or climb must keep at least ${MIN_SUBMISSION_PHOTOS} photos`,
    );
  }

  const repo = manager.getRepository(MediaAsset);
  const subjectWhere = subjectRouteId
    ? { subjectRouteId }
    : { subjectGymId: subjectGymId! };

  const current = await repo.find({ where: subjectWhere });
  const currentIds = new Set(current.map((a) => a.id));
  const desiredSet = new Set(desiredIds);

  // Unlink the ones the admin dropped.
  const toUnlink = current.filter((a) => !desiredSet.has(a.id));
  for (const asset of toUnlink) {
    asset.subjectRouteId = null;
    asset.subjectGymId = null;
  }

  // Link the newly-added ones.
  const addIds = desiredIds.filter((id) => !currentIds.has(id));
  let toLink: MediaAsset[] = [];
  if (addIds.length > 0) {
    toLink = await repo.find({ where: { id: In(addIds) } });
    if (toLink.length !== addIds.length) {
      throw new BadRequestException(
        'One or more photo ids do not resolve to an uploaded image',
      );
    }
    for (const asset of toLink) {
      if (asset.ownerUserId !== ownerUserId) {
        throw new BadRequestException(
          'A new photo must have been uploaded by you',
        );
      }
      if (asset.purpose !== purpose) {
        throw new BadRequestException(
          `Photo "${asset.id}" was not uploaded with purpose ${purpose}`,
        );
      }
      if (asset.subjectRouteId || asset.subjectGymId) {
        throw new BadRequestException(
          `Photo "${asset.id}" is already attached to another gym or climb`,
        );
      }
      asset.subjectRouteId = subjectRouteId ?? null;
      asset.subjectGymId = subjectGymId ?? null;
      asset.moderationStatus = MediaModerationStatus.APPROVED;
    }
  }

  if (toUnlink.length > 0) await repo.save(toUnlink);
  if (toLink.length > 0) await repo.save(toLink);
}

// Detach every photo from a subject about to be hard-deleted -- the
// media_assets rows survive as orphans (harmless: nothing renders a photo
// with no subject), rather than cascading a delete through media_reports /
// media_moderation_actions.
export async function unlinkAllSubmissionPhotos(
  manager: EntityManager,
  subject: { routeIds?: string[]; gymId?: string },
): Promise<void> {
  if (subject.gymId) {
    await manager.query(
      `UPDATE "media_assets" SET "subject_gym_id" = NULL WHERE "subject_gym_id" = $1::uuid`,
      [subject.gymId],
    );
  }
  if (subject.routeIds && subject.routeIds.length > 0) {
    await manager.query(
      `UPDATE "media_assets" SET "subject_route_id" = NULL WHERE "subject_route_id" = ANY($1::uuid[])`,
      [subject.routeIds],
    );
  }
}

// The "Photos pending admin approval" flag for a detail panel: true while
// no photo attached to this subject has been APPROVED yet (BL-x05). Raw SQL
// (against a DataSource or EntityManager) rather than a repo count -- it is
// a read on the map's hot path and mirrors MapService.countVerifications'
// existing style; the partial index IDX_media_assets_subject_* backs it.
export interface SqlRunner {
  query(sql: string, parameters?: unknown[]): Promise<unknown[]>;
}

export async function hasApprovedSubmissionPhoto(
  runner: SqlRunner,
  subject: { routeId?: string; gymId?: string },
): Promise<boolean> {
  const column = subject.routeId ? 'subject_route_id' : 'subject_gym_id';
  const id = subject.routeId ?? subject.gymId;
  const rows = await runner.query(
    `SELECT 1 FROM "media_assets"
      WHERE "${column}" = $1::uuid
        AND "moderation_status" = 'APPROVED'
      LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}
