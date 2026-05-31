import type { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import type { EventEnvelope, NotificationPayload } from '../../../packages/shared/src/events.js';
import { env } from './env.js';

export function renderEmail(payload: NotificationPayload) {
  const download = payload.data.download_url ? `\nDownload: ${payload.data.download_url}` : '';
  const campaign = payload.data.campaign_name ? `\nCampaign: ${payload.data.campaign_name}` : '';
  return `${payload.subject}${campaign}${download}`;
}

export async function handleNotification(
  prisma: PrismaClient,
  event: EventEnvelope<NotificationPayload>,
  sendMail?: (message: { from: string; to: string; subject: string; text: string }) => Promise<unknown>
) {
  const existing = await prisma.notificationLog.findUnique({ where: { dedupeKey: event.payload.dedupe_key } });
  if (existing?.sentAt) return { duplicate: true };

  const transporter = sendMail
    ? null
    : nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false
      });

  const message = {
    from: env.SMTP_FROM,
    to: event.payload.recipient_email,
    subject: event.payload.subject,
    text: renderEmail(event.payload)
  };
  await (sendMail ? sendMail(message) : transporter!.sendMail(message));

  await prisma.notificationLog.upsert({
    where: { dedupeKey: event.payload.dedupe_key },
    update: { sentAt: new Date() },
    create: {
      type: event.payload.type,
      recipientEmail: event.payload.recipient_email,
      linkId: event.payload.data.link_id,
      reportId: event.payload.data.report_id,
      periodKey: event.payload.dedupe_key,
      dedupeKey: event.payload.dedupe_key,
      sentAt: new Date()
    }
  });

  return { duplicate: false };
}
