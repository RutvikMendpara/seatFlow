import { Module } from '@nestjs/common';
import { LogMailer, MAILER } from './mailer';

@Module({
  providers: [{ provide: MAILER, useClass: LogMailer }],
  exports: [MAILER],
})
export class NotificationsModule {}
