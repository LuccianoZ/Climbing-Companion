import { Injectable } from '@nestjs/common';
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
} as const;

// Foundation §15/§20.1: Nodemailer + Gmail SMTP in production (~500/day,
// arbitrary recipients, no domain ownership needed), Mailpit in dev.
// Foundation §16: "Email is fully stubbed in automated tests -- assert the
// message that would have been sent; never contact a provider." That's the
// `isStubbed()` branch below -- under NODE_ENV=test, nothing ever touches
// the network; sent messages are recorded in-memory instead so a Cucumber
// step can pull the reset link straight out of `getSentEmails()`.
@Injectable()
export class MailService {
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

    if (this.isStubbed()) {
      this.sentEmails.push({ to, subject, text });
      return;
    }

    await this.transporter!.sendMail({
      from:
        this.config.get<string>('MAIL_FROM') ??
        'no-reply@climbingcompanion.com',
      to,
      subject,
      text,
    });
  }

  // BL-028 / Foundation §11-§12: every moderation reason is "emailed to the
  // affected user", and for image rejections / strikes the in-app
  // notification only points the user *to* their email for the actual
  // reasoning. A ban produces no in-app notification at all -- email is the
  // only channel. All three share one sender: the subject line and a short
  // lead-in differ, the body is always "<lead-in>\n\nReason: <reason>".
  async sendModerationEmail(
    to: string,
    kind: 'IMAGE_REJECTED' | 'STRIKE_ISSUED' | 'ACCOUNT_BANNED',
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

    if (this.isStubbed()) {
      this.sentEmails.push({ to, subject, text });
      return;
    }

    await this.transporter!.sendMail({
      from:
        this.config.get<string>('MAIL_FROM') ??
        'no-reply@climbingcompanion.com',
      to,
      subject,
      text,
    });
  }

  // Test-only introspection point: Cucumber's world resolves this service
  // straight out of the app's DI container (`this.app.get(MailService)`)
  // rather than the app ever making a real network call.
  getSentEmails(): readonly SentEmail[] {
    return this.sentEmails;
  }

  private isStubbed(): boolean {
    return this.config.get('NODE_ENV') === 'test';
  }

  private createTransporter(): Transporter {
    // Defaults target Mailpit's local SMTP listener (dev, per Foundation
    // §15) when SMTP_* isn't set; production sets these to Gmail SMTP.
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    return nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST') ?? '127.0.0.1',
      port: this.config.get<number>('SMTP_PORT') ?? 1025,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass } : undefined,
    });
  }
}
