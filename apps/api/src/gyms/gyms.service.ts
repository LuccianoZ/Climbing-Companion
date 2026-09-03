import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import tzLookup from 'tz-lookup';
import { Gym, GymDiscipline, type OperatingHours } from './entities/gym.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { MediaPurpose } from '../media/entities/media-asset.entity';
import {
  isWithinProximityOfPoint,
  STANDARD_PROXIMITY_METERS,
  type ProximityLocation,
} from '../common/geo/route-proximity.util';
import {
  linkSubmissionPhotos,
  listSubmissionPhotos,
  syncSubmissionPhotos,
  unlinkAllSubmissionPhotos,
  type SubmissionPhotoView,
} from '../common/media/link-submission-photos.util';
import { SubmitGymDto } from './dto/submit-gym.dto';
import { AdminVerifyGymDto } from './dto/admin-verify-gym.dto';
import { AdminUpdateGymDto } from './dto/admin-update-gym.dto';

export interface ForceArchiveGymResult {
  gymId: string;
  gymArchived: boolean;
  alreadyArchived: boolean;
}

// AR-51 BL-x07 (admin data stewardship): the full editable view of a gym,
// including archived ones.
export interface AdminGymView {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  disciplinesOffered: GymDiscipline[];
  operatingHours: OperatingHours;
  ianaTimezone: string;
  status: LifecycleStatus;
  verifiedDirectlyByAdmin: boolean;
  photos: SubmissionPhotoView[];
}

export interface HardDeleteGymResult {
  gymId: string;
  deleted: boolean;
}

export interface RestoreGymResult {
  gymId: string;
  restored: boolean;
  alreadyActive: boolean;
}

export interface SubmitGymContext {
  // Resolved by the controller (AR-16): X-Test-Mock-GPS, else the DTO's
  // deviceLatitude/deviceLongitude, else the pin coordinates themselves.
  deviceLocation: ProximityLocation;
  isAdmin: boolean;
}

// Architecture.md §3 / Foundation §4 + Sept 3 revision (AR-51):
//   - a NON-admin gym submission is now proximity-gated (BL-x02): the pin
//     must be within 300m of the submitter's live device location, checked
//     server-side by PostGIS ST_DWithin on geography (never in JS -- §19.4);
//   - it carries its disciplines, weekly hours and >= 3 photos up front
//     (BL-x04/x05); the IANA timezone is derived from the coordinates via
//     the offline `tz-lookup` package;
//   - an ADMIN submission (BL-x03) skips the proximity gate entirely,
//     is created `VERIFIED` outright, and its photos publish immediately
//     (moderation_status APPROVED, bypassing the §10 queue).
@Injectable()
export class GymsService {
  constructor(private readonly dataSource: DataSource) {}

  private get gyms() {
    return this.dataSource.getRepository(Gym);
  }

  async submitGym(
    submittedByUserId: string,
    dto: SubmitGymDto,
    context: SubmitGymContext,
  ): Promise<Gym> {
    const pin: ProximityLocation = {
      latitude: dto.latitude,
      longitude: dto.longitude,
    };

    // BL-x02 / §19.4: skipped for SYSTEM_ADMIN (BL-x03), enforced for
    // everyone else. The 301m negative test exercises exactly this branch.
    if (!context.isAdmin) {
      const inRange = await isWithinProximityOfPoint(
        this.dataSource.manager,
        context.deviceLocation,
        pin,
        STANDARD_PROXIMITY_METERS,
      );
      if (!inRange) {
        throw new ForbiddenException(
          `A gym pin must be placed within ${STANDARD_PROXIMITY_METERS}m of your current location`,
        );
      }
    }

    const ianaTimezone = this.resolveTimezone(dto.latitude, dto.longitude);

    return this.dataSource.transaction(async (manager) => {
      const gymRepo = manager.getRepository(Gym);
      const gym = await gymRepo.save(
        gymRepo.create({
          name: dto.name,
          location: {
            type: 'Point',
            coordinates: [dto.longitude, dto.latitude],
          },
          status: context.isAdmin
            ? LifecycleStatus.VERIFIED
            : LifecycleStatus.UNVERIFIED,
          disciplinesOffered: dto.disciplinesOffered,
          operatingHours: dto.operatingHours,
          ianaTimezone,
          submittedBy: submittedByUserId,
          verifiedDirectlyByAdmin: context.isAdmin,
          verifiedAt: context.isAdmin ? new Date() : null,
        }),
      );

      await linkSubmissionPhotos({
        manager,
        mediaIds: dto.photoMediaIds,
        ownerUserId: submittedByUserId,
        purpose: MediaPurpose.GYM_SUBMISSION_PHOTO,
        subjectGymId: gym.id,
        approve: context.isAdmin,
      });

      return gym;
    });
  }

  // Architecture.md AR-17 / BL-012: admin direct verification of an existing
  // UNVERIFIED gym (contrast BL-x03, which CREATES one already verified).
  // Bypasses the crowd-sourced pipeline -- no gym_verifications row.
  async adminVerifyGym(gymId: string, dto: AdminVerifyGymDto): Promise<Gym> {
    const gym = await this.gyms.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException(`Gym "${gymId}" not found`);
    }

    if (gym.status === LifecycleStatus.VERIFIED) {
      throw new ConflictException(
        'This gym is already VERIFIED; re-verification is unavailable',
      );
    }

    gym.status = LifecycleStatus.VERIFIED;
    gym.verifiedDirectlyByAdmin = true;
    gym.verifiedAt = new Date();
    gym.disciplinesOffered = dto.disciplinesOffered;
    return this.gyms.save(gym);
  }

  // BL-x07 / Foundation §14: an admin rewrites any field of any gym from any
  // location, no reason row. Only fields present in the DTO change. If
  // coordinates move, the IANA timezone is re-derived. `photoMediaIds`, when
  // present, is the full desired photo set (added ids linked+APPROVED,
  // dropped ids unlinked; >= 3 enforced).
  async adminUpdateGym(
    gymId: string,
    dto: AdminUpdateGymDto,
    adminUserId: string,
  ): Promise<Gym> {
    if ((dto.latitude == null) !== (dto.longitude == null)) {
      throw new BadRequestException(
        'latitude and longitude must be supplied together',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const gymRepo = manager.getRepository(Gym);
      const gym = await gymRepo.findOne({ where: { id: gymId } });
      if (!gym) {
        throw new NotFoundException(`Gym "${gymId}" not found`);
      }

      if (dto.name !== undefined) {
        gym.name = dto.name;
      }
      if (dto.latitude != null && dto.longitude != null) {
        gym.location = {
          type: 'Point',
          coordinates: [dto.longitude, dto.latitude],
        };
        gym.ianaTimezone = this.resolveTimezone(dto.latitude, dto.longitude);
      }
      if (dto.disciplinesOffered !== undefined) {
        gym.disciplinesOffered = dto.disciplinesOffered;
      }
      if (dto.operatingHours !== undefined) {
        gym.operatingHours = dto.operatingHours;
      }

      const saved = await gymRepo.save(gym);

      if (dto.photoMediaIds !== undefined) {
        await syncSubmissionPhotos({
          manager,
          desiredIds: dto.photoMediaIds,
          ownerUserId: adminUserId,
          purpose: MediaPurpose.GYM_SUBMISSION_PHOTO,
          subjectGymId: gymId,
        });
      }

      return saved;
    });
  }

  // BL-x07: the editor's read. Includes ARCHIVED gyms.
  async getGymForAdmin(gymId: string): Promise<AdminGymView> {
    return this.dataSource.transaction(async (manager) => {
      const gym = await manager
        .getRepository(Gym)
        .findOne({ where: { id: gymId } });
      if (!gym) {
        throw new NotFoundException(`Gym "${gymId}" not found`);
      }
      const photos = await listSubmissionPhotos(manager, { gymId });
      return {
        id: gym.id,
        name: gym.name,
        latitude: gym.location.coordinates[1],
        longitude: gym.location.coordinates[0],
        disciplinesOffered: gym.disciplinesOffered ?? [],
        operatingHours: gym.operatingHours ?? {},
        ianaTimezone: gym.ianaTimezone,
        status: gym.status,
        verifiedDirectlyByAdmin: gym.verifiedDirectlyByAdmin,
        photos,
      };
    });
  }

  // BL-x07 (admin stewardship): the irreversible option, gated in the UI
  // behind typing "DELETE". Dependent rows (verifications, disputes,
  // check-ins) are deleted; submission photos are unlinked, not deleted.
  async hardDeleteGym(gymId: string): Promise<HardDeleteGymResult> {
    return this.dataSource.transaction(async (manager) => {
      const gymRepo = manager.getRepository(Gym);
      const gym = await gymRepo.findOne({ where: { id: gymId } });
      if (!gym) {
        throw new NotFoundException(`Gym "${gymId}" not found`);
      }

      await manager.query(
        `DELETE FROM "gym_verifications" WHERE "gym_id" = $1::uuid`,
        [gymId],
      );
      await manager.query(
        `DELETE FROM "gym_information_disputes" WHERE "gym_id" = $1::uuid`,
        [gymId],
      );
      await manager.query(
        `DELETE FROM "gym_checkins" WHERE "gym_id" = $1::uuid`,
        [gymId],
      );
      await unlinkAllSubmissionPhotos(manager, { gymId });
      await manager.query(`DELETE FROM "gyms" WHERE "id" = $1::uuid`, [gymId]);

      return { gymId, deleted: true };
    });
  }

  // BL-x07: un-archive. An ARCHIVED gym returns to UNVERIFIED (its
  // pre-archive status is not stored, so it re-enters verification).
  async restoreGym(gymId: string): Promise<RestoreGymResult> {
    const gym = await this.gyms.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException(`Gym "${gymId}" not found`);
    }
    if (gym.status !== LifecycleStatus.ARCHIVED) {
      return { gymId, restored: false, alreadyActive: true };
    }
    gym.status = LifecycleStatus.UNVERIFIED;
    gym.archivedAt = null;
    gym.verifiedAt = null;
    gym.verifiedDirectlyByAdmin = false;
    await this.gyms.save(gym);
    return { gymId, restored: true, alreadyActive: false };
  }

  // BL-035 / Foundation §14: force-archive is a data-integrity mutation --
  // no reason, no accountability row. A gym has no child routes and no crag
  // (Foundation §4), so there is no cascade: the single row flips to the
  // terminal ARCHIVED state and disappears from every map query. Works
  // regardless of current status or elapsed time; re-archiving is a no-op.
  // BL-x07 reuses this as the "take down" half of admin stewardship.
  async forceArchiveGym(gymId: string): Promise<ForceArchiveGymResult> {
    const gym = await this.gyms.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException(`Gym "${gymId}" not found`);
    }

    if (gym.status === LifecycleStatus.ARCHIVED) {
      return { gymId, gymArchived: false, alreadyArchived: true };
    }

    gym.status = LifecycleStatus.ARCHIVED;
    gym.archivedAt = new Date();
    await this.gyms.save(gym);

    return { gymId, gymArchived: true, alreadyArchived: false };
  }

  // `tz-lookup` never throws for a valid lat/lng and always returns a zone
  // string (it falls back to an Etc/GMT±N offset zone over open ocean), so
  // no null handling is needed -- but a caller passing NaN would get "Etc/GMT"
  // back, which is why the DTO's @IsLatitude/@IsLongitude run first.
  private resolveTimezone(latitude: number, longitude: number): string {
    return tzLookup(latitude, longitude);
  }
}
