import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  // Length over composition rules -- OWASP guidance for a password that's
  // hashed at rest, not stored/compared in plaintext. No stated ceiling in
  // Foundation §15; 128 is a sane upper bound to keep argon2id's cost bounded.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName: string;
}
