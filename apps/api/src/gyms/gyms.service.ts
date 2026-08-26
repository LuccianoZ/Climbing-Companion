import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gym } from './entities/gym.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { SubmitGymDto } from './dto/submit-gym.dto';
import { AdminVerifyGymDto } from './dto/admin-verify-gym.dto';

// Architecture.md §3 / Foundation §4: a gym submission is a plain standalone
// insert -- no 300m proximity check, no crag relationship, no transaction
// spanning multiple tables (contrast RoutesService.submitRoute). Disciplines
// stay empty until BL-011's 4th verification unions them in.
@Injectable()
export class GymsService {
  constructor(@InjectRepository(Gym) private readonly gyms: Repository<Gym>) {}

  async submitGym(submittedByUserId: string, dto: SubmitGymDto): Promise<Gym> {
    const gym = this.gyms.create({
      name: dto.name,
      location: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
      status: LifecycleStatus.UNVERIFIED,
      disciplinesOffered: [],
      submittedBy: submittedByUserId,
      verifiedDirectlyByAdmin: false,
    });
    return this.gyms.save(gym);
  }

  // Architecture.md AR-17 / BL-012: bypasses the crowd-sourced pipeline
  // entirely -- no gym_verifications row is ever written here, so this
  // stays a plain single-table update on GymsService rather than living on
  // VerificationService alongside the two crowd-sourced methods. Sets
  // verified_directly_by_admin = true (BL-007 always inserts false) and
  // takes disciplines_offered straight from the admin's own DTO input, not
  // a union of verifications -- there may be zero of those rows at all.
  async adminVerifyGym(gymId: string, dto: AdminVerifyGymDto): Promise<Gym> {
    const gym = await this.gyms.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException(`Gym "${gymId}" not found`);
    }

    // Same "once VERIFIED, unavailable going forward" convention as the
    // crowd-sourced path (VerificationService.submitGymVerification) --
    // an admin re-verifying an already-VERIFIED gym is a no-op the caller
    // should not be able to trigger silently.
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
}
