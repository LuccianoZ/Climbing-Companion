import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface LoginResult {
  user: PublicUser;
  sessionToken: string;
  sessionExpiresAt: Date;
}

// Foundation §15: session cookie carries an "encrypted refresh token" with a
// 30-day lifecycle.
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// Foundation §15 specifies the password-reset flow ("token-appended email
// link -> decoupled page -> commits new hash") but not a TTL for the link.
// One hour is the standard security tradeoff for reset tokens: short enough
// to limit exposure if the email is intercepted, long enough that a user
// checking their inbox promptly won't hit an expired link. See Architecture.md
// AR-12.
const PASSWORD_RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

// A generic message for both "no such account" and "wrong password" --
// distinguishing them in the response would let an attacker enumerate
// registered emails via the login endpoint.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset token';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokens: Repository<PasswordResetToken>,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const passwordHash = await hash(dto.password, this.hashOptions());

    const user = this.users.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      role: UserRole.VERIFIED_USER,
    });

    try {
      const saved = await this.users.save(user);
      return this.toPublicUser(saved);
    } catch (err) {
      // The UNIQUE constraint on `users.email` (citext, case-insensitive) is
      // the actual source of truth for "already in use" -- catching the
      // Postgres unique-violation here instead of pre-checking with a
      // findOne() avoids a check-then-insert race between two concurrent
      // registrations for the same address.
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Email is already in use');
      }
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    // Same generic message either way (INVALID_CREDENTIALS_MESSAGE) so the
    // response body can't be used to enumerate registered emails. Not
    // attempting to also equalize response *timing* between these two
    // branches -- that's a real defense but extra scope beyond what this
    // MVP's threat model (§21) calls for.
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Single active session per user (Architecture.md AR-10): a new login
    // overwrites any previous session rather than accumulating rows in a
    // separate table. The raw token goes to the browser in the cookie; only
    // its SHA-256 hash is ever persisted ("encrypted at rest, not stored
    // plain" -- see AR-10 for why a one-way hash rather than reversible
    // encryption).
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    user.refreshTokenHash = this.hashToken(sessionToken);
    user.refreshTokenExpiresAt = sessionExpiresAt;
    await this.users.save(user);

    return { user: this.toPublicUser(user), sessionToken, sessionExpiresAt };
  }

  // BL-003 / Architecture.md AR-11: clears the session server-side, not just
  // the browser's copy of the cookie -- nulling both columns here is what
  // makes a replayed old cookie fail SessionGuard's lookup afterwards
  // (validateSession() below finds no row whose refresh_token_hash matches
  // once it's null). The controller is responsible for also calling
  // res.clearCookie() so the browser drops its copy too.
  async logout(userId: string): Promise<void> {
    await this.users.update(userId, {
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });
  }

  // BL-003 / Architecture.md AR-11: the guard's lookup path. Re-hashes the
  // raw cookie token with the same SHA-256 convention login() uses to store
  // it, finds the user whose refresh_token_hash matches, and rejects if that
  // session has expired. Returns the public user shape (never the password
  // hash) since this result gets attached straight onto the request.
  async validateSession(rawToken: string): Promise<PublicUser | null> {
    const tokenHash = this.hashToken(rawToken);
    const user = await this.users.findOne({
      where: { refreshTokenHash: tokenHash },
    });

    if (!user) {
      return null;
    }

    if (
      !user.refreshTokenExpiresAt ||
      user.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    return this.toPublicUser(user);
  }

  // BL-004 / Architecture.md AR-12: the "request" half of password reset.
  // Always resolves the same way whether or not the email has an account --
  // the caller (controller) returns an identical response either way, so
  // this endpoint can't be used to enumerate registered addresses (same
  // concern login's generic failure message already addresses).
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const resetToken = this.passwordResetTokens.create({
      userId: user.id,
      tokenHash: this.hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_LIFETIME_MS),
      usedAt: null,
    });
    await this.passwordResetTokens.save(resetToken);

    const baseUrl =
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    await this.mail.sendPasswordResetEmail(user.email, resetUrl);
  }

  // BL-004 / Architecture.md AR-12: the "confirm" half. Redeeming a valid,
  // unexpired, not-yet-used token commits the new argon2id hash and marks
  // the token used (used_at) so a second redemption is rejected -- BL-004's
  // acceptance criteria. Also nulls the user's active session (AR-10/AR-11
  // columns): a password reset is exactly the moment a stolen session
  // cookie should stop working too, not just a stolen password.
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const resetToken = await this.passwordResetTokens.findOne({
      where: { tokenHash },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const user = await this.users.findOne({ where: { id: resetToken.userId } });
    if (!user) {
      throw new UnauthorizedException(INVALID_RESET_TOKEN_MESSAGE);
    }

    user.passwordHash = await hash(newPassword, this.hashOptions());
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    await this.users.save(user);

    resetToken.usedAt = new Date();
    await this.passwordResetTokens.save(resetToken);
  }

  // BL-005 / Architecture.md AR-13: the lookup MockAuthGuard delegates to
  // when resolving the X-Test-Mock-Auth header's referenced user id --
  // deliberately a plain id lookup with no password/session involved, since
  // the whole point of the bypass is to skip those for Cucumber scenarios.
  async findPublicUserById(id: string): Promise<PublicUser | null> {
    const user = await this.users.findOne({ where: { id } });
    return user ? this.toPublicUser(user) : null;
  }

  private hashToken(raw: string): string {
    // A fast hash is deliberate and correct here, unlike the argon2id used
    // for passwords: this token is a high-entropy random value, not a
    // low-entropy human-chosen secret, so it isn't vulnerable to the offline
    // brute-force/dictionary attacks argon2's memory-hardness defends
    // against -- SHA-256 is the standard choice for hashing bearer tokens.
    return createHash('sha256').update(raw).digest('hex');
  }

  private hashOptions() {
    const isTest = this.config.get('NODE_ENV') === 'test';
    return {
      // @node-rs/argon2 declares `Algorithm` as an ambient `const enum`,
      // which `isolatedModules` (required for swc's single-file transpile)
      // forbids referencing directly -- so this is the raw value of
      // `Algorithm.Argon2id` from its index.d.ts, not a magic number.
      algorithm: 2,
      // Foundation §15: OWASP cost parameters in production, reduced in test
      // so the auth suite doesn't add real seconds per scenario.
      ...(isTest ? { memoryCost: 8, timeCost: 1, parallelism: 1 } : {}),
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === '23505'
    );
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
