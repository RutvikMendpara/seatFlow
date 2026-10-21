import { Injectable, Logger } from '@nestjs/common';

export const MAILER = Symbol('MAILER');

export type Email = { to: string; subject: string; text: string };

export interface Mailer {
  send(email: Email): Promise<void>;
}

function maskEmail(address: string) {
  const [name = '', domain = ''] = address.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

// No email provider yet, so emails go to the log. The address is masked so
// logs don't collect customer emails.
@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  async send(email: Email) {
    this.logger.log(`To ${maskEmail(email.to)}: ${email.subject}\n${email.text}`);
  }
}
