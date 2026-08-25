import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  // No complexity/length policy re-checked here -- login only ever compares
  // against the stored hash. Non-empty is enough for the DTO layer.
  @IsString()
  @MinLength(1)
  password: string;
}
