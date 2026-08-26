import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitGymDto } from './dto/submit-gym.dto';
import { GymsService } from './gyms.service';
import { Gym } from './entities/gym.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { Repository } from 'typeorm';

describe('SubmitGymDto validation', () => {
  const validGym = {
    name: 'Vertical Edge Climbing Gym',
    latitude: 42.8864,
    longitude: -78.8784,
  };

  it('accepts a fully-populated submission', async () => {
    const dto = plainToInstance(SubmitGymDto, validGym);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each(['name', 'latitude', 'longitude'])(
    'rejects a submission missing mandatory field %s',
    async (field) => {
      const payload = { ...validGym } as Record<string, unknown>;
      delete payload[field];
      const dto = plainToInstance(SubmitGymDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );
});

describe('GymsService.submitGym', () => {
  let gymRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let service: GymsService;

  const dto: SubmitGymDto = plainToInstance(SubmitGymDto, {
    name: 'Vertical Edge Climbing Gym',
    latitude: 42.8864,
    longitude: -78.8784,
  });

  const submitterId = 'user-1';

  beforeEach(() => {
    gymRepo = {
      create: vi.fn((data: Partial<Gym>) => ({ ...data }) as Gym),
      save: vi.fn((g: Gym) => ({ ...g, id: 'gym-1' })),
    };
    service = new GymsService(gymRepo as unknown as Repository<Gym>);
  });

  it('creates a standalone gyms row with no crag relationship, default UNVERIFIED status, and empty disciplines', async () => {
    const result = await service.submitGym(submitterId, dto);

    expect(gymRepo.create).toHaveBeenCalledTimes(1);
    const createArg = gymRepo.create.mock.calls[0][0] as Gym;
    expect(createArg.name).toBe(dto.name);
    expect(createArg.location).toEqual({
      type: 'Point',
      coordinates: [dto.longitude, dto.latitude],
    });
    expect(createArg.status).toBe(LifecycleStatus.UNVERIFIED);
    expect(createArg.disciplinesOffered).toEqual([]);
    expect(createArg.submittedBy).toBe(submitterId);
    expect(createArg.verifiedDirectlyByAdmin).toBe(false);
    expect('cragId' in createArg).toBe(false);

    expect(gymRepo.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('gym-1');
  });
});
