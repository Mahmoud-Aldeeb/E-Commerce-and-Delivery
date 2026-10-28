import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

@Injectable()
export class MailService {
  private transporter: ReturnType<typeof createTransport>;

  constructor(private config: ConfigService) {
    this.transporter = createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail({ to, subject, body }: SendEmailParams) {
    return this.transporter.sendMail({
      from: this.config.get<string>('SENDER_EMAIL'),
      to,
      subject,
      html: body,
    });
  }
}
