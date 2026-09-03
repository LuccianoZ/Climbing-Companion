import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { DataSource } from 'typeorm';
import { SubmitGymDto } from './dto/submit-gym.dto';
import { AdminVerifyGymDto } from './dto/admin-verify-gym.dto';
import { AdminUpdateGymDto } from './dto/admin-update-gym.dto';
import { GymsService } from './gyms.service';
import { Gym, GymDiscipline } from './entities/gym.entity';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../media/entities/media-asset.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';

const validWeek = {
  '0': [],
  '1': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '2': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '3': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '4': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '5': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '6': [{ opens: '00:00', closes: '00:00', fullDay: true }],
};

const validGymPayload = {
  name: 'Vertical Edge Climbing Gym',
  latitude: 42.8864,
  longitude: -78.8784,
  disciplinesOffered: [GymDiscipline.TOP_ROPE, GymDiscipline.LEAD],
  operatingHours: validWeek,
  photoMediaIds: [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ],
};

describe('SubmitGymDto validation', () => {
  it('accepts a fully-populated submission', async () => {
    const dto = plainToInstance(SubmitGymDto, validGymPayload);
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    'name',
    'latitude',
    'longitude',
    'disciplinesOffered',
    'operatingHours',
    'photoMediaIds',
  ])('rejects a submission missing mandatory field %s', async (field) => {
    const payload = { ...validGymPayload } as Record<string, unknown>;
    delete payload[field];
    const dto = plainToInstance(SubmitGymDto, payload);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === field)).toBe(true);
  });

  it('rejects fewer than 3 photo ids', async () => {
    const dto = plainToInstance(SubmitGymDto, {
      ...validGymPayload,
      photoMediaIds: validGymPayload.photoMediaIds.slice(0, 2),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'photoMediaIds')).toBe(true);
  });

  it('rejects an empty disciplines array', async () => {
    const dto = plainToInstance(SubmitGymDto, {
      ...validGymPayload,
      disciplinesOffered: [],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'disciplinesOffered')).toBe(true);
  });

  it('rejects an operating-hours object missing a weekday', async () => {
    const { '3': _drop, ...missing } = validWeek;
    void _drop;
    const dto = plainToInstance(SubmitGymDto, {
      ...validGymPayload,
      operatingHours: missing,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'operatingHours')).toBe(true);
  });
});

function makeAsset(
  id: string,
  overrides: Partial<MediaAsset> = {},
): MediaAsset {
  return {
    id,
    ownerUserId: 'user-1',
    purpose: MediaPurpose.GYM_SUBMISSION_PHOTO,
    payload: Buffer.from(''),
    mimeType: 'image/jpeg',
    byteSize: 1,
    moderationStatus: MediaModerationStatus.PENDING,
    subjectRouteId: null,
    subjectGymId: null,
    etag: 'e',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GymsService.submitGym', () => {
  let gymRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let mediaRepo: {
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let query: ReturnType<typeof vi.fn>;
  let dataSource: {
    manager: { query: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let service: GymsService;

  const dto: SubmitGymDto = plainToInstance(SubmitGymDto, validGymPayload);
  const submitterId = 'user-1';

  beforeEach(() => {
    gymRepo = {
      create: vi.fn((d: Partial<Gym>) => ({ ...d }) as Gym),
      save: vi.fn((g: Gym) => ({ ...g, id: 'gym-1' })),
    };
    mediaRepo = {
      find: vi
        .fn()
        .mockResolvedValue(dto.photoMediaIds.map((id) => makeAsset(id))),
      save: vi.fn((rows: MediaAsset[]) => rows),
    };
    query = vi.fn().mockResolvedValue([{ within: true }]);
    const txManager = {
      getRepository: vi.fn((e: unknown) => {
        if (e === Gym) return gymRepo;
        if (e === MediaAsset) return mediaRepo;
        throw new Error('unexpected repo');
      }),
    };
    dataSource = {
      manager: { query },
      transaction: vi.fn((cb: (m: typeof txManager) => unknown) =>
        cb(txManager),
      ),
      getRepository: vi.fn(() => gymRepo),
    };
    service = new GymsService(dataSource as unknown as DataSource);
  });

  const nonAdmin = {
    deviceLocation: { latitude: 42.8864, longitude: -78.8784 },
    isAdmin: false,
  };
  const admin = {
    deviceLocation: { latitude: 0, longitude: 0 },
    isAdmin: true,
  };

  it('non-admin: creates an UNVERIFIED gym with disciplines, hours, derived timezone, and PENDING photos', async () => {
    const result = await service.submitGym(submitterId, dto, nonAdmin);

    const createArg = gymRepo.create.mock.calls[0][0] as Gym;
    expect(createArg.status).toBe(LifecycleStatus.UNVERIFIED);
    expect(createArg.disciplinesOffered).toEqual(dto.disciplinesOffered);
    expect(createArg.operatingHours).toEqual(validWeek);
    expect(createArg.ianaTimezone).toBe('America/New_York'); // tz-lookup, offline
    expect(createArg.verifiedDirectlyByAdmin).toBe(false);
    expect(result.id).toBe('gym-1');

    const savedPhotos = mediaRepo.save.mock.calls[0][0] as MediaAsset[];
    expect(savedPhotos).toHaveLength(3);
    expect(savedPhotos.every((p) => p.subjectGymId === 'gym-1')).toBe(true);
    expect(
      savedPhotos.every(
        (p) => p.moderationStatus === MediaModerationStatus.PENDING,
      ),
    ).toBe(true);
  });

  it('non-admin: rejects a pin outside 300m of the device location (BL-x02 / §19.4)', async () => {
    query.mockResolvedValue([{ within: false }]);
    await expect(
      service.submitGym(submitterId, dto, nonAdmin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('admin: skips the proximity gate, creates VERIFIED, and publishes photos APPROVED (BL-x03)', async () => {
    query.mockResolvedValue([{ within: false }]); // would fail for a non-admin
    const result = await service.submitGym(submitterId, dto, admin);

    expect(query).not.toHaveBeenCalled();
    const createArg = gymRepo.create.mock.calls[0][0] as Gym;
    expect(createArg.status).toBe(LifecycleStatus.VERIFIED);
    expect(createArg.verifiedDirectlyByAdmin).toBe(true);
    expect(createArg.verifiedAt).toBeInstanceOf(Date);
    expect(result.id).toBe('gym-1');

    const savedPhotos = mediaRepo.save.mock.calls[0][0] as MediaAsset[];
    expect(
      savedPhotos.every(
        (p) => p.moderationStatus === MediaModerationStatus.APPROVED,
      ),
    ).toBe(true);
  });

  it('rejects a photo not owned by the submitter', async () => {
    mediaRepo.find.mockResolvedValue([
      makeAsset(dto.photoMediaIds[0]),
      makeAsset(dto.photoMediaIds[1]),
      makeAsset(dto.photoMediaIds[2], { ownerUserId: 'someone-else' }),
    ]);
    await expect(
      service.submitGym(submitterId, dto, nonAdmin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a photo already attached to another submission', async () => {
    mediaRepo.find.mockResolvedValue([
      makeAsset(dto.photoMediaIds[0]),
      makeAsset(dto.photoMediaIds[1]),
      makeAsset(dto.photoMediaIds[2], { subjectRouteId: 'route-9' }),
    ]);
    await expect(
      service.submitGym(submitterId, dto, nonAdmin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function baseGym(overrides: Partial<Gym> = {}): Gym {
  return {
    id: 'gym-1',
    name: 'Vertical Edge Climbing Gym',
    location: { type: 'Point', coordinates: [-78.8712, 42.8901] },
    status: LifecycleStatus.UNVERIFIED,
    disciplinesOffered: [GymDiscipline.TOP_ROPE],
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

function serviceWithGymRepo(
  gymRepo: unknown,
  extra: {
    mediaRepo?: unknown;
    query?: ReturnType<typeof vi.fn>;
  } = {},
): GymsService {
  const mediaRepo = extra.mediaRepo ?? {
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
  };
  const query = extra.query ?? vi.fn().mockResolvedValue([]);
  const txManager = {
    getRepository: vi.fn((e: unknown) => {
      if (e === Gym) return gymRepo;
      if (e === MediaAsset) return mediaRepo;
      throw new Error('unexpected repo');
    }),
    query,
  };
  const dataSource = {
    getRepository: vi.fn((e: unknown) => {
      if (e === Gym) return gymRepo;
      if (e === MediaAsset) return mediaRepo;
      return gymRepo;
    }),
    transaction: vi.fn((cb: (m: typeof txManager) => unknown) => cb(txManager)),
    query,
  };
  return new GymsService(dataSource as unknown as DataSource);
}

const ADMIN_ID = 'admin-1';

describe('GymsService.adminVerifyGym', () => {
  let gymRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let service: GymsService;

  const gymId = 'gym-1';
  const dto: AdminVerifyGymDto = plainToInstance(AdminVerifyGymDto, {
    disciplinesOffered: [GymDiscipline.TOP_ROPE, GymDiscipline.LEAD],
  });

  beforeEach(() => {
    gymRepo = { findOne: vi.fn(), save: vi.fn((g: Gym) => g) };
    service = serviceWithGymRepo(gymRepo);
  });

  it('rejects when the gym is not found', async () => {
    gymRepo.findOne.mockResolvedValue(null);
    await expect(service.adminVerifyGym(gymId, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects re-verifying an already-VERIFIED gym', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ status: LifecycleStatus.VERIFIED }),
    );
    await expect(service.adminVerifyGym(gymId, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(gymRepo.save).not.toHaveBeenCalled();
  });

  it('sets VERIFIED, verified_directly_by_admin, and disciplines from the DTO', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    const result = await service.adminVerifyGym(gymId, dto);
    expect(result.status).toBe(LifecycleStatus.VERIFIED);
    expect(result.verifiedDirectlyByAdmin).toBe(true);
    expect(result.verifiedAt).toBeInstanceOf(Date);
    expect(result.disciplinesOffered).toEqual(dto.disciplinesOffered);
  });
});

describe('GymsService.adminUpdateGym (BL-x07)', () => {
  let gymRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let service: GymsService;

  beforeEach(() => {
    gymRepo = { findOne: vi.fn(), save: vi.fn((g: Gym) => g) };
    service = serviceWithGymRepo(gymRepo);
  });

  it('throws NotFound for an unknown gym', async () => {
    gymRepo.findOne.mockResolvedValue(null);
    await expect(
      service.adminUpdateGym(
        'gym-x',
        plainToInstance(AdminUpdateGymDto, { name: 'X' }),
        ADMIN_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only changes the fields present in the DTO', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ name: 'Old', disciplinesOffered: [GymDiscipline.LEAD] }),
    );
    const result = await service.adminUpdateGym(
      'gym-1',
      plainToInstance(AdminUpdateGymDto, { name: 'New Name' }),
      ADMIN_ID,
    );
    expect(result.name).toBe('New Name');
    expect(result.disciplinesOffered).toEqual([GymDiscipline.LEAD]);
  });

  it('re-derives the IANA timezone when coordinates move', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ ianaTimezone: 'America/New_York' }),
    );
    const result = await service.adminUpdateGym(
      'gym-1',
      plainToInstance(AdminUpdateGymDto, {
        latitude: 34.0195,
        longitude: -118.4912,
      }),
      ADMIN_ID,
    );
    expect(result.ianaTimezone).toBe('America/Los_Angeles');
    expect(result.location.coordinates).toEqual([-118.4912, 34.0195]);
  });

  it('rejects latitude without longitude', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    await expect(
      service.adminUpdateGym(
        'gym-1',
        plainToInstance(AdminUpdateGymDto, { latitude: 34 }),
        ADMIN_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('syncs the photo set when photoMediaIds is present: links new, unlinks dropped', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    const existing = [
      makeAsset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
        subjectGymId: 'gym-1',
      }),
      makeAsset('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
        subjectGymId: 'gym-1',
      }),
      makeAsset('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
        subjectGymId: 'gym-1',
      }),
    ];
    const newPhoto = makeAsset('dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      ownerUserId: ADMIN_ID,
    });
    const mediaRepo = {
      find: vi
        .fn()
        // syncSubmissionPhotos first loads current (by subject), then adds
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce([newPhoto]),
      save: vi.fn((rows: MediaAsset[]) => rows),
    };
    const svc = serviceWithGymRepo(gymRepo, { mediaRepo });

    await svc.adminUpdateGym(
      'gym-1',
      plainToInstance(AdminUpdateGymDto, {
        photoMediaIds: [
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        ],
      }),
      ADMIN_ID,
    );

    // Gather every saved asset across all save() calls (order varies:
    // unlink, then re-approve kept, then link new).
    const saved = new Map<string, MediaAsset>();
    for (const call of mediaRepo.save.mock.calls) {
      for (const asset of call[0]) saved.set(asset.id, asset);
    }

    // aaaa dropped -> unlinked
    expect(
      saved.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')?.subjectGymId,
    ).toBeNull();
    // dddd added -> linked + APPROVED
    const linked = saved.get('dddddddd-dddd-4ddd-8ddd-dddddddddddd')!;
    expect(linked.subjectGymId).toBe('gym-1');
    expect(linked.moderationStatus).toBe(MediaModerationStatus.APPROVED);
    // bbbb / cccc kept -> published (were PENDING)
    expect(
      saved.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')?.moderationStatus,
    ).toBe(MediaModerationStatus.APPROVED);
    expect(
      saved.get('cccccccc-cccc-4ccc-8ccc-cccccccccccc')?.moderationStatus,
    ).toBe(MediaModerationStatus.APPROVED);
  });

  it('rejects a photo set below the 3-photo floor', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    await expect(
      service.adminUpdateGym(
        'gym-1',
        plainToInstance(AdminUpdateGymDto, {
          photoMediaIds: ['11111111-1111-4111-8111-111111111111'],
        }),
        ADMIN_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('GymsService stewardship: getGymForAdmin / restore / hardDelete (BL-x07)', () => {
  let gymRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let mediaRepo: {
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let query: ReturnType<typeof vi.fn>;
  let service: GymsService;

  beforeEach(() => {
    gymRepo = { findOne: vi.fn(), save: vi.fn((g: Gym) => g) };
    mediaRepo = { find: vi.fn().mockResolvedValue([]), save: vi.fn() };
    query = vi.fn().mockResolvedValue([]);
    service = serviceWithGymRepo(gymRepo, { mediaRepo, query });
  });

  it('getGymForAdmin returns editable fields + photos, flipping coordinate order', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    mediaRepo.find.mockResolvedValue([
      makeAsset('11111111-1111-4111-8111-111111111111', {
        subjectGymId: 'gym-1',
        moderationStatus: MediaModerationStatus.APPROVED,
      }),
    ]);

    const view = await service.getGymForAdmin('gym-1');
    expect(view.latitude).toBe(42.8901);
    expect(view.longitude).toBe(-78.8712);
    expect(view.photos).toHaveLength(1);
    expect(view.photos[0].moderationStatus).toBe(
      MediaModerationStatus.APPROVED,
    );
  });

  it('restoreGym un-archives an ARCHIVED gym to UNVERIFIED', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ status: LifecycleStatus.ARCHIVED, archivedAt: new Date() }),
    );
    const result = await service.restoreGym('gym-1');
    expect(result).toEqual({
      gymId: 'gym-1',
      restored: true,
      alreadyActive: false,
    });
    const saved = gymRepo.save.mock.calls[0][0] as Gym;
    expect(saved.status).toBe(LifecycleStatus.UNVERIFIED);
    expect(saved.archivedAt).toBeNull();
  });

  it('restoreGym is a no-op for an active gym', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    const result = await service.restoreGym('gym-1');
    expect(result.alreadyActive).toBe(true);
    expect(gymRepo.save).not.toHaveBeenCalled();
  });

  it('hardDeleteGym deletes dependents, unlinks photos, then the row', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    const result = await service.hardDeleteGym('gym-1');
    expect(result).toEqual({ gymId: 'gym-1', deleted: true });
    const statements = query.mock.calls.map((c) => c[0] as string);
    expect(statements.some((s) => s.includes('gym_verifications'))).toBe(true);
    expect(statements.some((s) => s.includes('gym_information_disputes'))).toBe(
      true,
    );
    expect(statements.some((s) => s.includes('gym_checkins'))).toBe(true);
    expect(statements.some((s) => s.includes('subject_gym_id'))).toBe(true);
    expect(statements.some((s) => /DELETE FROM "gyms"/.test(s))).toBe(true);
  });

  it('hardDeleteGym 404s for an unknown gym', async () => {
    gymRepo.findOne.mockResolvedValue(null);
    await expect(service.hardDeleteGym('gym-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('GymsService.forceArchiveGym (BL-035)', () => {
  let gymRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let service: GymsService;

  beforeEach(() => {
    gymRepo = { findOne: vi.fn(), save: vi.fn((g: Gym) => g) };
    service = serviceWithGymRepo(gymRepo);
  });

  it('throws NotFound when the gym does not exist', async () => {
    gymRepo.findOne.mockResolvedValue(null);
    await expect(service.forceArchiveGym('gym-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(gymRepo.save).not.toHaveBeenCalled();
  });

  it('archives a VERIFIED gym: sets ARCHIVED + archived_at', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ status: LifecycleStatus.VERIFIED }),
    );
    const result = await service.forceArchiveGym('gym-1');
    expect(result).toEqual({
      gymId: 'gym-1',
      gymArchived: true,
      alreadyArchived: false,
    });
    const saved = gymRepo.save.mock.calls[0][0] as Gym;
    expect(saved.status).toBe(LifecycleStatus.ARCHIVED);
    expect(saved.archivedAt).toBeInstanceOf(Date);
  });

  it('is a no-op when the gym is already ARCHIVED', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ status: LifecycleStatus.ARCHIVED }),
    );
    const result = await service.forceArchiveGym('gym-1');
    expect(result).toEqual({
      gymId: 'gym-1',
      gymArchived: false,
      alreadyArchived: true,
    });
    expect(gymRepo.save).not.toHaveBeenCalled();
  });
});
