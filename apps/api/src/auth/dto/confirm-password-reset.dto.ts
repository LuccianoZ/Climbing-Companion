import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(1)
  token: string;

  // Same length policy as RegisterDto.password -- Foundation §15 doesn't
  // restate it for reset, but a reset password shouldn't be held to a
  // looser standard than registration.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
