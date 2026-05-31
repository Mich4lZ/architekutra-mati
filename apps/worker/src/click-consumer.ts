import type { PrismaClient } from '@prisma/client';
import type { ClickRecordedPayload, EventEnvelope } from '../../../packages/shared/src/events.js';
import { hashIp } from './hash.js';
import { lookupGeo } from './geo.js';
import { parseUserAgent } from './ua.js';

export async function handleClickRecorded(
  prisma: PrismaClient,
  event: EventEnvelope<ClickRecordedPayload>,
  salt: string
) {
  const duplicate = await prisma.click.findUnique({ where: { eventId: event.event_id }, select: { id: true } });
  if (duplicate) return { duplicate: true };

  const ua = parseUserAgent(event.payload.user_agent);
  const geo = await lookupGeo(event.payload.ip_address);

  await prisma.click.create({
    data: {
      linkId: event.payload.link_id,
      eventId: event.event_id,
      clickedAt: new Date(event.payload.clicked_at),
      country: geo.country,
      city: geo.city,
      deviceType: ua.device_type,
      browser: ua.browser,
      os: ua.os,
      referrer: event.payload.referrer,
      ipHash: hashIp(event.payload.ip_address, salt)
    }
  });
  return { duplicate: false };
}
