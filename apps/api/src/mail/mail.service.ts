import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
}

const MODERATION_EMAIL_COPY = {
  IMAGE_REJECTED: {
    subject: 'A photo you uploaded to Climbing Companion was removed',
    lead: 'An administrator reviewed a photo you uploaded and removed it from Climbing Companion.',
  },
  STRIKE_ISSUED: {
    subject: 'You received a moderation strike on Climbing Companion',
    lead: 'An administrator issued a strike against your Climbing Companion account. Three strikes result in an automatic suspension.',
  },
  ACCOUNT_BANNED: {
    subject: 'Your Climbing Companion account has been suspended',
    lead: 'Your Climbing Companion account has been suspended and you can no longer sign in.',
  },
  // BL-033 / Foundation §11: the two reversal actions from the User Account
  // Audit view also carry a mandatory, emailed reason.
  STRIKE_REVOKED: {
    subject:
      'A moderation strike on your Climbing Companion account was revoked',
    lead: 'An administrator revoked a strike on your Climbing Companion account.',
  },
  ACCOUNT_RESTORED: {
    subject: 'Your Climbing Companion account has been restored',
    lead: 'An administrator restored your Climbing Companion account. Any suspension has been lifted and your strike count has been reset to zero.',
  },
} as const;

export type ModerationEmailKind = keyof typeof MODERATION_EMAIL_COPY;

// Foundation §15/§20.1: Nodemailer + Gmail SMTP in production (~500/day,
// arbitrary recipients, no domain ownership needed), Mailpit in dev.
// Foundation §16: "Email is fully stubbed in automated tests -- assert the
// message that would have been sent; never contact a provider." That's the
// `isStubbed()` branch below -- under NODE_ENV=test, nothing ever touches
// the network; sent messages are recorded in-memory instead so a Cucumber
// step can pull the reset link straight out of `getSentEmails()`.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly sentEmails: SentEmail[] = [];

  constructor(private readonly config: ConfigService) {
    this.transporter = this.isStubbed() ? null : this.createTransporter();
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your Climbing Companion password';
    // Foundation §15: "token-appended email link -> decoupled page ->
    // commits new hash." The link itself carries the raw single-use token
    // as a query param; the server only ever stores its SHA-256 hash
    // (Architecture AR-12), the same convention as AR-10's session token.
    const text = [
      'Someone requested a password reset for your Climbing Companion account.',
      '',
      `Use this link to choose a new password: ${resetUrl}`,
      '',
      "If you didn't request this, you can safely ignore this email -- your password won't change.",
    ].join('\n');

    await this.deliver({ to, subject, text });
  }

  // BL-028 / Foundation §11-§12: every moderation reason is "emailed to the
  // affected user", and for image rejections / strikes the in-app
  // notification only points the user *to* their email for the actual
  // reasoning. A ban produces no in-app notification at all -- email is the
  // only channel. All three share one sender: the subject line and a short
  // lead-in differ, the body is always "<lead-in>\n\nReason: <reason>".
  async sendModerationEmail(
    to: string,
    kind: ModerationEmailKind,
    reason: string,
  ): Promise<void> {
    const { subject, lead } = MODERATION_EMAIL_COPY[kind];
    const text = [
      lead,
      '',
      `Reason: ${reason}`,
      '',
      'If you believe this was a mistake, reply to this email or contact support (Settings → Help).',
    ].join('\n');

    await this.deliver({ to, subject, text });
  }

  // Test-only introspection point: Cucumber's world resolves this service
  // straight out of the app's DI container (`this.app.get(MailService)`)
  // rather than the app ever making a real network call.
  getSentEmails(): readonly SentEmail[] {
    return this.sentEmails;
  }

  // Delivery is deliberately BEST-EFFORT: a transport failure is logged and
  // swallowed, never rethrown. Every caller reaches this point *after* its
  // state change has already committed, so letting an SMTP error escape
  // turns a succeeded action into a 500:
  //   - AuthService.requestPasswordReset (Foundation §15 / AR-12) has already
  //     written the reset token, and is contractually required to answer
  //     identically for a known and an unknown address. Throwing here made
  //     the endpoint an account-enumeration oracle -- a registered email got
  //     500, an unregistered one got 200.
  //   - ModerationService / AccountabilityService (Foundation §11) have
  //     already committed the strike, ban, or rejection. A 500 there invites
  //     the admin to retry and apply the action twice.
  // The email is an out-of-band notification, not part of either invariant.
  private async deliver(message: SentEmail): Promise<void> {
    if (this.isStubbed()) {
      this.sentEmails.push(message);
      return;
    }

    try {
      await this.transporter!.sendMail({
        from:
          this.config.get<string>('MAIL_FROM') ??
          'no-reply@climbingcompanion.com',
        ...message,
      });
    } catch (error) {
      // Logged loudly: a misconfigured or unreachable SMTP host is a real
      // deployment fault (Foundation §20.2), it just isn't the caller's.
      this.logger.error(
        `Failed to deliver "${message.subject}" to ${message.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private isStubbed(): boolean {
    return this.config.get('NODE_ENV') === 'test';
  }

  private createTransporter(): Transporter {
    // Defaults target Mailpit's local SMTP listener (dev, per Foundation
    // §15) when SMTP_* isn't set; production sets these to Gmail SMTP.
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    // ConfigService hands back the raw string from .env, so the port has to
    // be coerced -- nodemailer silently mis-negotiates TLS on a string port.
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 1025);

    return nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST') ?? '127.0.0.1',
      port: Number.isFinite(port) ? port : 1025,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass } : undefined,
    });
  }
}
