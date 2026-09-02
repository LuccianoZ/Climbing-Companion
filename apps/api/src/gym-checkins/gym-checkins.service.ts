import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Gym } from '../gyms/entities/gym.entity';
import { GymCheckin } from './entities/gym-checkin.entity';
import { CheckInDto } from './dto/check-in.dto';
import {
  ProximityLocation,
  STANDARD_PROXIMITY_METERS,
  isWithinProximity,
} from '../common/geo/route-proximity.util';

// Architecture.md §5 / AR-18-style 300m-gated write. BL-024: a Verified
// Climber within 300m of a gym can check in, gated the same way grade
// voting and climb logging are -- isWithinProximity() against the 'gyms'
// table (the same helper already supports both tables, see its own
// comment), inside one transaction so the proximity read and the insert
// see a consistent view.
//
// No self-exclusion and no lifecycle-status gate: neither is documented
// anywhere for check-in (Foundation §8 only names the 300m boundary), and
// gym_checkins carries no status/relationship column that would make
// either possible to enforce even if it were.
//
// AR-39: BL-025 (a self-recorded per-facility grade tier, originally
// scoped alongside check-in under this same Epic 5) was cut from scope
// before implementation began. This service has no tier-reading or
// tier-writing method, and none is planned.
@Injectable()
export class GymCheckinsService {
  constructor(private readonly dataSource: DataSource) {}

  async checkIn(
    gymId: string,
    userId: string,
    _dto: CheckInDto,
    location: ProximityLocation,
  ): Promise<GymCheckin> {
    return this.dataSource.transaction(async (manager) => {
      const gymRepo = manager.getRepository(Gym);
      const gym = await gymRepo.findOne({ where: { id: gymId } });
      if (!gym) {
        throw new NotFoundException(`Gym "${gymId}" not found`);
      }

      const withinRange = await isWithinProximity(
        manager,
        'gyms',
        gymId,
        location,
        STANDARD_PROXIMITY_METERS,
      );
      if (!withinRange) {
        throw new ForbiddenException(
          `Climber must be within ${STANDARD_PROXIMITY_METERS}m of the gym to check in`,
        );
      }

      const checkinRepo = manager.getRepository(GymCheckin);
      return checkinRepo.save(checkinRepo.create({ gymId, userId }));
    });
  }
}
