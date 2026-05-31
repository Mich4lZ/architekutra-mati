import type { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EventEnvelope, NotificationPayload, ReportRequestedPayload } from '../../../packages/shared/src/events.js';
import { env } from './env.js';
import { publishEvent } from './rabbit.js';

function writeLine(doc: PDFKit.PDFDocument, label: string, value: string | number) {
  doc.fontSize(11).text(`${label}: ${value}`);
}

export async function buildReportStats(prisma: PrismaClient, payload: ReportRequestedPayload) {
  const where: any = {
    clickedAt: { gte: new Date(payload.date_from), lte: new Date(payload.date_to) },
    link: {}
  };
  if (payload.link_ids.length) where.linkId = { in: payload.link_ids };
  if (payload.client_id) where.link.clientId = payload.client_id;

  const [total, unique, countries, devices, referrers] = await Promise.all([
    prisma.click.count({ where }),
    prisma.click.findMany({ where: { ...where, ipHash: { not: null } }, distinct: ['ipHash'], select: { ipHash: true } }),
    prisma.click.groupBy({ by: ['country'], where, _count: { _all: true }, orderBy: { _count: { country: 'desc' } }, take: 5 }),
    prisma.click.groupBy({ by: ['deviceType'], where, _count: { _all: true }, orderBy: { _count: { deviceType: 'desc' } }, take: 5 }),
    prisma.click.groupBy({ by: ['referrer'], where, _count: { _all: true }, orderBy: { _count: { referrer: 'desc' } }, take: 5 })
  ]);
  return { total, unique: unique.length, countries, devices, referrers };
}

export async function handleReportRequested(prisma: PrismaClient, event: EventEnvelope<ReportRequestedPayload>) {
  await prisma.report.update({ where: { id: event.payload.report_id }, data: { status: 'processing' } });
  try {
    const stats = await buildReportStats(prisma, event.payload);
    fs.mkdirSync(env.PDF_STORAGE_PATH, { recursive: true });
    const filePath = path.join(env.PDF_STORAGE_PATH, `report_${event.payload.report_id}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48 });
      doc.pipe(fs.createWriteStream(filePath).on('finish', resolve).on('error', reject));
      doc.fontSize(20).text('TrackFlow Report');
      doc.moveDown();
      writeLine(doc, 'Date from', event.payload.date_from);
      writeLine(doc, 'Date to', event.payload.date_to);
       writeLine(doc, 'Total clicks', stats.total);
       writeLine(doc, 'Unique clicks', stats.unique);
       doc.moveDown().fontSize(14).text('Top countries');
       stats.countries.forEach((row: any) => writeLine(doc, row.country ?? 'unknown', row._count._all));
       doc.moveDown().fontSize(14).text('Top devices');
       stats.devices.forEach((row: any) => writeLine(doc, row.deviceType ?? 'unknown', row._count._all));
       doc.moveDown().fontSize(14).text('Top referrers');
       stats.referrers.forEach((row: any) => writeLine(doc, row.referrer ?? 'direct', row._count._all));
      doc.end();
    });

    await prisma.report.update({
      where: { id: event.payload.report_id },
      data: { status: 'done', filePath, completedAt: new Date() }
    });

    const report = await prisma.report.findUnique({ where: { id: event.payload.report_id }, include: { client: true, requester: true } });
    const recipient = report?.kind === 'weekly' ? report.client?.contactEmail : report?.requester.email;
    if (recipient) {
      const notification: EventEnvelope<NotificationPayload> = {
        event_id: randomUUID(),
        event_type: 'notification.send',
        version: '1.0',
        timestamp: new Date().toISOString(),
        payload: {
          type: event.payload.kind === 'weekly' ? 'weekly_report' : 'report_ready',
          recipient_email: recipient,
          subject: event.payload.kind === 'weekly' ? 'Weekly TrackFlow report' : 'TrackFlow report is ready',
          template: event.payload.kind === 'weekly' ? 'weekly_report' : 'report_ready',
          dedupe_key: `${event.payload.kind}:${event.payload.report_id}`,
          data: {
            report_id: event.payload.report_id,
            link_id: null,
            download_url: `${env.APP_BASE_URL}/api/reports/${event.payload.report_id}/download`,
            campaign_name: null,
            short_code: null,
            date_from: event.payload.date_from,
            date_to: event.payload.date_to
          }
        }
      };
      publishEvent('notification.send', notification);
    }
  } catch (error: any) {
    await prisma.report.update({
      where: { id: event.payload.report_id },
      data: { status: 'failed', errorMessage: String(error?.message ?? error) }
    });
  }
}
