import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User, UserRole } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Mocked at the module boundary so the real @node-rs/argon2 native binding
// (platform-specific) never has to load for these unit tests -- also makes
// the suite fast and deterministic instead of paying real KDF cost.
vi.mock('@node-rs/argon2', () => ({
  Algorithm: { Argon2id: 2 },
  hash: vi
    .fn()
    .mockResolvedValue('$argon2id$v=19$m=8,t=1,p=1$c29tZXNhbHQ$ZmFrZWhhc2g'),
  verify: vi.fn(),
}));

type MockRepo = {
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
};

describe('AuthService', () => {
  let service: AuthService;
  let repo: MockRepo;

  const dto: RegisterDto = {
    email: 'climber@example.com',
    password: 'correct horse battery staple',
    displayName: 'Alex',
  };

  beforeEach(async () => {
    repo = {
      create: vi.fn((data: Partial<User>) => data as User),
      save: vi.fn(),
      findOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repo },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('writes a users row with role defaulted to VERIFIED_USER and an argon2id hash, not plaintext', async () => {
      repo.save.mockImplementation((u: Partial<User>) => ({
        id: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...u,
      }));

      const result = await service.register(dto);

      expect(repo.save).toHaveBeenCalledTimes(1);
      const savedArg = repo.save.mock.calls[0][0] as User;
      expect(savedArg.role).toBe(UserRole.VERIFIED_USER);
      expect(savedArg.passwordHash).not.toBe(dto.password);
      expect(savedArg.passwordHash).toMatch(/^\$argon2id\$/);

      expect(result.role).toBe(UserRole.VERIFIED_USER);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('hashes the password with the argon2id algorithm', async () => {
      const { hash } = await import('@node-rs/argon2');
      repo.save.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        passwordHash: 'x',
        role: UserRole.VERIFIED_USER,
      });

      await service.register(dto);

      expect(hash).toHaveBeenCalledWith(
        dto.password,
        expect.objectContaining({ algorithm: 2 }),
      );
    });

    it('rejects registration with an email already in use (unique-violation from the DB)', async () => {
      repo.save.mockRejectedValue({ code: '23505' });

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('propagates unexpected save errors instead of masking them as a conflict', async () => {
      repo.save.mockRejectedValue(new Error('connection lost'));

      await expect(service.register(dto)).rejects.toThrow('connection lost');
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = { email: dto.email, password: dto.password };

    const existingUser = (): User =>
      ({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        passwordHash: 'stored-hash',
        role: UserRole.VERIFIED_USER,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      }) as User;

    it('issues a session token and stores its hash (not the raw token) with a ~30-day expiry', async () => {
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(true);
      repo.findOne.mockResolvedValue(existingUser());
      repo.save.mockImplementation((u: User) => u);

      const result = await service.login(loginDto);

      expect(repo.save).toHaveBeenCalledTimes(1);
      const savedArg = repo.save.mock.calls[0][0] as User;
      expect(savedArg.refreshTokenHash).toBeTruthy();
      expect(savedArg.refreshTokenHash).not.toBe(result.sessionToken);

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const deltaMs = result.sessionExpiresAt.getTime() - Date.now();
      expect(deltaMs).toBeGreaterThan(thirtyDaysMs - 5000);
      expect(deltaMs).toBeLessThanOrEqual(thirtyDaysMs);

      expect(result.user.role).toBe(UserRole.VERIFIED_USER);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects an unknown email with the same generic message login uses for a wrong password', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toMatchObject({
        message: 'Invalid email or password',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a wrong password with the same generic message login uses for an unknown email', async () => {
      const { verify } = await import('@node-rs/argon2');
      vi.mocked(verify).mockResolvedValue(false);
      repo.findOne.mockResolvedValue(existingUser());

      await expect(service.login(loginDto)).rejects.toMatchObject({
        message: 'Invalid email or password',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
