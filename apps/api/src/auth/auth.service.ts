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

// A generic message for both "no such account" and "wrong password" --
// distinguishing them in the response would let an attacker enumerate
// registered emails via the login endpoint.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
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
