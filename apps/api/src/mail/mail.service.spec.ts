import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

// Mocked at the module boundary so no test run ever opens a real SMTP
// connection -- Foundation §16: "Email is fully stubbed in automated
// tests... never contact a provider."
const sendMail = vi.fn().mockResolvedValue({ messageId: 'stub-id' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

describe('MailService', () => {
  const buildService = async (env: string): Promise<MailService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'NODE_ENV') return env;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    return module.get(MailService);
  };

  beforeEach(() => {
    sendMail.mockClear();
  });

  describe('under NODE_ENV=test', () => {
    it('records the password reset email instead of sending it over the network', async () => {
      const service = await buildService('test');

      await service.sendPasswordResetEmail(
        'climber@example.com',
        'http://localhost:3000/reset-password?token=abc123',
      );

      expect(sendMail).not.toHaveBeenCalled();
      const sent = service.getSentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('climber@example.com');
      expect(sent[0].text).toContain(
        'http://localhost:3000/reset-password?token=abc123',
      );
    });

    it('accumulates multiple sent emails for later assertions', async () => {
      const service = await buildService('test');

      await service.sendPasswordResetEmail('a@example.com', 'http://x/1');
      await service.sendPasswordResetEmail('b@example.com', 'http://x/2');

      expect(service.getSentEmails()).toHaveLength(2);
    });

    it('records a moderation email carrying the reason and the right subject per kind', async () => {
      const service = await buildService('test');

      await service.sendModerationEmail(
        'owner@example.com',
        'STRIKE_ISSUED',
        'Off-topic content',
      );
      await service.sendModerationEmail(
        'owner@example.com',
        'ACCOUNT_BANNED',
        'Repeated violations',
      );

      expect(sendMail).not.toHaveBeenCalled();
      const sent = service.getSentEmails();
      expect(sent).toHaveLength(2);
      expect(sent[0].subject).toContain('strike');
      expect(sent[0].text).toContain('Reason: Off-topic content');
      expect(sent[1].subject).toContain('suspended');
      expect(sent[1].text).toContain('Reason: Repeated violations');
    });
  });

  describe('outside NODE_ENV=test', () => {
    it('sends through the nodemailer transporter instead of recording in-memory', async () => {
      const service = await buildService('development');

      await service.sendPasswordResetEmail(
        'climber@example.com',
        'http://localhost:3000/reset-password?token=abc123',
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      const call = sendMail.mock.calls[0][0] as { to: string; text: string };
      expect(call.to).toBe('climber@example.com');
      expect(call.text).toContain('token=abc123');
      expect(service.getSentEmails()).toHaveLength(0);
    });
  });
});
