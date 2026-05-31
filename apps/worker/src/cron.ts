import { addDays, endOfDay, format, getISOWeek, startOfDay, subDays } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../packages/db/src/client.js';
import type { EventEnvelope, NotificationPayload, ReportRequestedPayload } from '../../../packages/shared/src/events.js';
import { env } from './env.js';
import { publishEvent } from './rabbit.js';

export async function runWeeklyReport() {
  const now = new Date();
  const lastMonday = startOfDay(subDays(now, now.getDay() === 0 ? 13 : now.getDay() + 6));
  const lastSunday = endOfDay(addDays(lastMonday, 6));
  const yearWeek = `${lastMonday.getUTCFullYear()}-${String(getISOWeek(lastMonday)).padStart(2, '0')}`;
  const systemUser = await prisma.user.findFirst({ where: { role: 'marketer' }, orderBy: { createdAt: 'asc' } });
  if (!systemUser) return;

  const clients = await prisma.client.findMany();
  for (const client of clients) {
    const dedupe = `weekly_report:${client.id}:${yearWeek}`;
    const existing = await prisma.notificationLog.findUnique({ where: { dedupeKey: dedupe } });
    if (existing) continue;

    const report = await prisma.report.create({
      data: {
        status: 'pending',
        requestedBy: systemUser.id,
        clientId: client.id,
        linkIds: [],
        dateFrom: lastMonday,
        dateTo: lastSunday,
        kind: 'weekly'
      }
    });
    await prisma.notificationLog.create({
      data: {
        type: 'weekly_report',
        recipientEmail: client.contactEmail,
        reportId: report.id,
        periodKey: yearWeek,
        dedupeKey: dedupe
      }
    });
    const event: EventEnvelope<ReportRequestedPayload> = {
      event_id: randomUUID(),
      event_type: 'report.requested',
      version: '1.0',
      timestamp: now.toISOString(),
      payload: {
        report_id: report.id,
        requested_by: systemUser.id,
        client_id: client.id,
        link_ids: [],
        date_from: lastMonday.toISOString(),
        date_to: lastSunday.toISOString(),
        kind: 'weekly'
      }
    };
    publishEvent('report.requested', event);
  }
}

export async function runAlertNoClicks() {
  const now = new Date();
  const links = await prisma.link.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    include: { client: true, creator: true },
    take: 500
  });

  for (const link of links) {
    const last = await prisma.click.findFirst({ where: { linkId: link.id }, orderBy: { clickedAt: 'desc' } });
    if (last && last.clickedAt.getTime() > now.getTime() - 24 * 60 * 60 * 1000) continue;
    const day = format(now, 'yyyy-MM-dd');
    const dedupe = `alert_no_clicks:${link.id}:${day}`;
    const existing = await prisma.notificationLog.findUnique({ where: { dedupeKey: dedupe } });
    if (existing?.sentAt) continue;
    const event: EventEnvelope<NotificationPayload> = {
      event_id: randomUUID(),
      event_type: 'notification.send',
      version: '1.0',
      timestamp: now.toISOString(),
      payload: {
        type: 'alert_no_clicks',
        recipient_email: link.creator.email,
        subject: 'TrackFlow alert: no clicks in 24h',
        template: 'alert_no_clicks',
        dedupe_key: dedupe,
        data: {
          report_id: null,
          link_id: link.id,
          download_url: null,
          campaign_name: link.campaignName,
          short_code: link.shortCode,
          date_from: null,
          date_to: null
        }
      }
    };
    publishEvent('notification.send', event);
  }
}

export function startCronLoops() {
  setInterval(() => {
    void runAlertNoClicks().catch((error) => console.error({ error }, 'alert-no-clicks failed'));
  }, 15 * 60 * 1000);
  setInterval(() => {
    const now = new Date();
    if (now.getUTCDay() === 1 && now.getUTCHours() === 8 && now.getUTCMinutes() < 15) {
      void runWeeklyReport().catch((error) => console.error({ error }, 'weekly-report failed'));
    }
  }, 60 * 1000);
}
