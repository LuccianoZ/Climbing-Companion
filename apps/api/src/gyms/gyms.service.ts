import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gym } from './entities/gym.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { SubmitGymDto } from './dto/submit-gym.dto';

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
}
