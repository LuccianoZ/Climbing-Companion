import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { RolesGuard } from './roles.guard';
import { PasswordResetToken } from './entities/password-reset-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, PasswordResetToken]), MailModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, RolesGuard],
  // SessionGuard is exported alongside AuthService so later epics (route
  // submission, verification, logging, etc.) can import AuthModule and
  // guard their own endpoints with the same "must be logged in" check
  // rather than re-implementing cookie/hash lookup per module. RolesGuard
  // (Architecture.md AR-17 / BL-012) joins them for the same reason --
  // any module needing "must also have this role" reuses this one
  // instead of re-deriving RBAC.
  exports: [AuthService, SessionGuard, RolesGuard],
})
export class AuthModule {}
