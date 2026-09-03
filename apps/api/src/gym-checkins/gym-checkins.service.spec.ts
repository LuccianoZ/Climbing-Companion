import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { GymCheckinsService } from './gym-checkins.service';
import { GymCheckin } from './entities/gym-checkin.entity';
import { Gym, GymDiscipline } from '../gyms/entities/gym.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { CheckInDto } from './dto/check-in.dto';

describe('GymCheckinsService', () => {
  let gymRepo: { findOne: ReturnType<typeof vi.fn> };
  let checkinRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: {
    getRepository: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: GymCheckinsService;

  const gymId = 'gym-1';
  const userId = 'user-1';
  const location = { latitude: 42.89, longitude: -78.87 };

  function baseGym(overrides: Partial<Gym> = {}): Gym {
    return {
      id: gymId,
      name: 'Chalk Line Bouldering',
      location: { type: 'Point', coordinates: [-78.87, 42.89] },
      status: LifecycleStatus.UNVERIFIED,
      disciplinesOffered: [] as GymDiscipline[],
      operatingHours: {},
      ianaTimezone: 'America/New_York',
      submittedBy: 'submitter-1',
      verifiedDirectlyByAdmin: false,
      verifiedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    gymRepo = { findOne: vi.fn() };
    checkinRepo = {
      create: vi.fn((data: Partial<GymCheckin>) => ({ ...data }) as GymCheckin),
      save: vi.fn((checkin: GymCheckin) => ({
        ...checkin,
        id: 'checkin-1',
        checkedInAt: new Date(),
      })),
    };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Gym) return gymRepo;
        if (entity === GymCheckin) return checkinRepo;
        throw new Error('unexpected repository requested');
      }),
      query: vi.fn(),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    service = new GymCheckinsService(dataSource as unknown as DataSource);
  });

  const dto: CheckInDto = {};

  it('throws NotFoundException when the gym does not exist', async () => {
    gymRepo.findOne.mockResolvedValue(undefined);
    await expect(service.checkIn(gymId, userId, dto, location)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when the climber is outside 300m', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    manager.query.mockResolvedValueOnce([{ within: false }]);
    await expect(service.checkIn(gymId, userId, dto, location)).rejects.toThrow(
      ForbiddenException,
    );
    expect(checkinRepo.save).not.toHaveBeenCalled();
  });

  it('writes a gym_checkins row when within 300m', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    manager.query.mockResolvedValueOnce([{ within: true }]);

    const result = await service.checkIn(gymId, userId, dto, location);

    expect(checkinRepo.create).toHaveBeenCalledWith({ gymId, userId });
    expect(result.gymId).toBe(gymId);
    expect(result.userId).toBe(userId);
  });

  it('allows repeat check-ins with no uniqueness check -- each call independently inserts', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    manager.query.mockResolvedValue([{ within: true }]);

    await service.checkIn(gymId, userId, dto, location);
    await service.checkIn(gymId, userId, dto, location);

    expect(checkinRepo.save).toHaveBeenCalledTimes(2);
  });
});
