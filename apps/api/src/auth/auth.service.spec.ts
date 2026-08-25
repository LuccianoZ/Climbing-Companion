import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { User, UserRole } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { MailService } from '../mail/mail.service';
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
  update: ReturnType<typeof vi.fn>;
};

describe('AuthService', () => {
  let service: AuthService;
  let repo: MockRepo;
  let resetTokenRepo: MockRepo;
  let mailService: { sendPasswordResetEmail: ReturnType<typeof vi.fn> };

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
      update: vi.fn(),
    };
    resetTokenRepo = {
      create: vi.fn(
        (data: Partial<PasswordResetToken>) => data as PasswordResetToken,
      ),
      save: vi.fn((t: PasswordResetToken) => t),
      findOne: vi.fn(),
      update: vi.fn(),
    };
    mailService = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repo },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: resetTokenRepo,
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test') },
        },
        { provide: MailService, useValue: mailService },
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

  // BL-003 / Architecture.md AR-11: logout must null the session server-side,
  // not just tell the browser to drop its cookie -- the story's acceptance
  // criteria explicitly call out "not just client-side expiry".
  describe('logout', () => {
    it('nulls the refresh token hash and expiry for the given user', async () => {
      repo.update.mockResolvedValue({ affected: 1 });

      await service.logout('user-1');

      expect(repo.update).toHaveBeenCalledWith('user-1', {
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      });
    });
  });

  // BL-003 / Architecture.md AR-11: the session-validation guard's lookup
  // path -- re-hash the raw cookie token, find the user whose stored hash
  // matches, and reject if that session has expired.
  describe('validateSession', () => {
    const rawToken = 'a-raw-session-token';
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');

    it('resolves the public user when the token hash matches and has not expired', async () => {
      const future = new Date(Date.now() + 60_000);
      repo.findOne.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        passwordHash: 'stored-hash',
        role: UserRole.VERIFIED_USER,
        refreshTokenHash: expectedHash,
        refreshTokenExpiresAt: future,
      });

      const result = await service.validateSession(rawToken);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { refreshTokenHash: expectedHash },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('user-1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('returns null when no user matches the token hash', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.validateSession('bogus-token');

      expect(result).toBeNull();
    });

    it('returns null when the matching session has already expired', async () => {
      const past = new Date(Date.now() - 1000);
      repo.findOne.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        role: UserRole.VERIFIED_USER,
        refreshTokenHash: expectedHash,
        refreshTokenExpiresAt: past,
      });

      const result = await service.validateSession(rawToken);

      expect(result).toBeNull();
    });
  });

  // BL-004 / Architecture.md AR-12: request half of the "forgot password"
  // flow -- issues a single-use token and emails a reset link. Must never
  // reveal whether an email address has an account (same enumeration
  // concern login's generic message already addresses).
  describe('requestPasswordReset', () => {
    it('creates a single-use token and emails a reset link when the account exists', async () => {
      repo.findOne.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        role: UserRole.VERIFIED_USER,
      });

      await service.requestPasswordReset(dto.email);

      expect(resetTokenRepo.save).toHaveBeenCalledTimes(1);
      const savedToken = resetTokenRepo.save.mock
        .calls[0][0] as PasswordResetToken;
      expect(savedToken.userId).toBe('user-1');
      expect(savedToken.tokenHash).toBeTruthy();
      expect(savedToken.usedAt ?? null).toBeNull();
      expect(savedToken.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [to, resetUrl] = mailService.sendPasswordResetEmail.mock
        .calls[0] as [string, string];
      expect(to).toBe(dto.email);
      expect(resetUrl).toContain('token=');
    });

    it('silently no-ops for an email with no account -- never reveals whether it exists', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset('nobody@example.com'),
      ).resolves.toBeUndefined();

      expect(resetTokenRepo.save).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // BL-004 / Architecture.md AR-12: confirm half -- redeeming a token
  // commits the new hash, marks the token used, and (per AR-10/AR-11's
  // session model) invalidates any existing session so a stolen cookie
  // doesn't survive a password reset.
  describe('resetPassword', () => {
    const rawToken = 'a-raw-reset-token';
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');

    const validToken = (): PasswordResetToken =>
      ({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: expectedHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      }) as PasswordResetToken;

    it('commits the new argon2id hash, marks the token used, and clears the session', async () => {
      resetTokenRepo.findOne.mockResolvedValue(validToken());
      repo.findOne.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        passwordHash: 'old-hash',
        role: UserRole.VERIFIED_USER,
        refreshTokenHash: 'some-existing-session-hash',
        refreshTokenExpiresAt: new Date(Date.now() + 1000),
      });
      repo.save.mockImplementation((u: User) => u);

      await service.resetPassword(rawToken, 'a brand new password');

      expect(repo.save).toHaveBeenCalledTimes(1);
      const savedUser = repo.save.mock.calls[0][0] as User;
      expect(savedUser.passwordHash).toMatch(/^\$argon2id\$/);
      expect(savedUser.passwordHash).not.toBe('old-hash');
      expect(savedUser.refreshTokenHash).toBeNull();
      expect(savedUser.refreshTokenExpiresAt).toBeNull();

      expect(resetTokenRepo.save).toHaveBeenCalledTimes(1);
      const savedToken = resetTokenRepo.save.mock
        .calls[0][0] as PasswordResetToken;
      expect(savedToken.usedAt).toBeInstanceOf(Date);
    });

    it('rejects an unknown token', async () => {
      resetTokenRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword('bogus-token', 'a brand new password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      resetTokenRepo.findOne.mockResolvedValue({
        ...validToken(),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword(rawToken, 'a brand new password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a token that has already been used once', async () => {
      resetTokenRepo.findOne.mockResolvedValue({
        ...validToken(),
        usedAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword(rawToken, 'a brand new password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // BL-005 / Architecture.md AR-13: the lookup MockAuthGuard delegates to
  // when resolving the X-Test-Mock-Auth header's referenced user id.
  describe('findPublicUserById', () => {
    it('resolves the public user shape for an existing id', async () => {
      repo.findOne.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        displayName: dto.displayName,
        passwordHash: 'stored-hash',
        role: UserRole.VERIFIED_USER,
      });

      const result = await service.findPublicUserById('user-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('user-1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('returns null for an id with no matching user', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findPublicUserById('nonexistent-user');

      expect(result).toBeNull();
    });
  });
});
