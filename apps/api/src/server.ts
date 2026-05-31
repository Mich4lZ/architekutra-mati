import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import Redis from 'ioredis';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../packages/db/src/client.js';
import { errorBody, pageParams } from '../../../packages/shared/src/http.js';
import { generateShortCode } from '../../../packages/shared/src/short-code.js';
import type { ClickRecordedPayload, EventEnvelope, ReportRequestedPayload } from '../../../packages/shared/src/events.js';
import { registerAuth, requireAuth, requireMarketer } from './auth.js';
import { env } from './env.js';
import { closeRabbit, publishEvent } from './rabbit.js';

const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
void redis.connect().catch((error) => console.error({ error }, 'Redis connect failed'));

type RedirectCache = { link_id: string; original_url: string; expires_at: string | null };

function isActiveLink(link: { active: boolean; deletedAt: Date | null; expiresAt: Date | null }) {
  return link.active && !link.deletedAt && (!link.expiresAt || link.expiresAt.getTime() > Date.now());
}

function ttlSeconds(expiresAt: Date | null) {
  if (!expiresAt) return 24 * 60 * 60;
  return Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

function serializeLink(link: any) {
  return {
    id: link.id,
    short_code: link.shortCode,
    original_url: link.originalUrl,
    campaign_name: link.campaignName,
    client_id: link.clientId,
    created_by: link.createdBy,
    active: link.active,
    expires_at: link.expiresAt?.toISOString() ?? null,
    created_at: link.createdAt.toISOString(),
    updated_at: link.updatedAt.toISOString()
  };
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await registerAuth(app);

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/clients', { preHandler: requireMarketer }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const { page, limit, skip } = pageParams(query);
    const where = query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {};
    const [data, total] = await Promise.all([
      prisma.client.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.client.count({ where })
    ]);
    return {
      data: data.map((client) => ({
        id: client.id,
        name: client.name,
        contact_email: client.contactEmail,
        created_at: client.createdAt.toISOString()
      })),
      total,
      page
    };
  });

  app.post('/api/clients', { preHandler: requireMarketer }, async (request, reply) => {
    const body = request.body as { name?: string; contact_email?: string };
    if (!body.name || !body.contact_email) {
      return reply.code(400).send(errorBody('VALIDATION_ERROR', 'name and contact_email are required'));
    }
    const client = await prisma.client.create({ data: { name: body.name, contactEmail: body.contact_email } });
    return reply.code(201).send({
      id: client.id,
      name: client.name,
      contact_email: client.contactEmail,
      created_at: client.createdAt.toISOString()
    });
  });

  app.get('/api/links', { preHandler: requireMarketer }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const { page, limit, skip } = pageParams(query);
    const where: any = { deletedAt: null };
    if (query.client_id) where.clientId = query.client_id;
    if (query.campaign_name) where.campaignName = { contains: query.campaign_name, mode: 'insensitive' };
    if (query.active !== undefined) where.active = query.active === 'true';
    const [data, total] = await Promise.all([
      prisma.link.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.link.count({ where })
    ]);
    return { data: data.map(serializeLink), total, page };
  });

  app.post('/api/links', { preHandler: requireMarketer }, async (request, reply) => {
    const body = request.body as { original_url?: string; client_id?: string; campaign_name?: string | null; expires_at?: string | null };
    if (!body.original_url || !body.client_id) {
      return reply.code(400).send(errorBody('VALIDATION_ERROR', 'original_url and client_id are required'));
    }
    try {
      new URL(body.original_url);
    } catch {
      return reply.code(400).send(errorBody('VALIDATION_ERROR', 'original_url must be a valid URL'));
    }
    const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
    if (expiresAt && expiresAt.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      return reply.code(400).send(errorBody('VALIDATION_ERROR', 'expires_at cannot be later than 365 days from now'));
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const link = await prisma.link.create({
          data: {
            shortCode: generateShortCode(),
            originalUrl: body.original_url,
            clientId: body.client_id,
            campaignName: body.campaign_name ?? null,
            expiresAt,
            createdBy: request.userAuth!.id
          }
        });
        return reply.code(201).send(serializeLink(link));
      } catch (error: any) {
        if (error.code !== 'P2002') throw error;
      }
    }
    return reply.code(400).send(errorBody('VALIDATION_ERROR', 'Could not generate unique short code'));
  });

  app.get('/api/links/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const link = await prisma.link.findFirst({ where: { id, deletedAt: null } });
    if (!link) return reply.code(404).send(errorBody('LINK_NOT_FOUND', 'Link not found'));
    if (request.userAuth!.role === 'client' && request.userAuth!.client_id !== link.clientId) {
      return reply.code(404).send(errorBody('LINK_NOT_FOUND', 'Link not found'));
    }
    return serializeLink(link);
  });

  app.delete('/api/links/:id', { preHandler: requireMarketer }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const link = await prisma.link.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
    await redis.del(`redirect:${link.shortCode}`).catch(() => undefined);
    return reply.code(204).send();
  });

  app.get('/api/links/:id/stats', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;
    const link = await prisma.link.findFirst({ where: { id, deletedAt: null } });
    if (!link) return reply.code(404).send(errorBody('LINK_NOT_FOUND', 'Link not found'));
    if (request.userAuth!.role === 'client' && request.userAuth!.client_id !== link.clientId) {
      return reply.code(404).send(errorBody('LINK_NOT_FOUND', 'Link not found'));
    }
    const dateFrom = query.date_from ? new Date(query.date_from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();
    const period = query.period === 'week' ? 'week' : query.period === 'hour' ? 'hour' : 'day';
    const bucket = period === 'week' ? 'week' : period === 'hour' ? 'hour' : 'day';
    const where = { linkId: id, clickedAt: { gte: dateFrom, lte: dateTo } };
    const [total, unique, timeRows, countryRows, deviceRows, refRows] = await Promise.all([
      prisma.click.count({ where }),
      prisma.click.findMany({ where: { ...where, ipHash: { not: null } }, distinct: ['ipHash'], select: { ipHash: true } }),
      prisma.$queryRawUnsafe<Array<{ timestamp: Date; count: bigint }>>(
        `SELECT date_trunc('${bucket}', clicked_at) AS timestamp, count(*)::bigint AS count FROM clicks WHERE link_id = $1 AND clicked_at >= $2 AND clicked_at <= $3 GROUP BY 1 ORDER BY 1`,
        id,
        dateFrom,
        dateTo
      ),
      prisma.click.groupBy({ by: ['country'], where, _count: { _all: true }, orderBy: { _count: { country: 'desc' } }, take: 5 }),
      prisma.click.groupBy({ by: ['deviceType'], where, _count: { _all: true }, orderBy: { _count: { deviceType: 'desc' } }, take: 5 }),
      prisma.click.groupBy({ by: ['referrer'], where, _count: { _all: true }, orderBy: { _count: { referrer: 'desc' } }, take: 5 })
    ]);
    return {
      total_clicks: total,
      unique_clicks: unique.length,
      clicks_over_time: timeRows.map((row) => ({ timestamp: row.timestamp.toISOString(), count: Number(row.count) })),
      by_country: countryRows.filter((r) => r.country).map((r) => ({ country: r.country!, count: r._count._all })),
      by_device: deviceRows.filter((r) => r.deviceType).map((r) => ({ device_type: r.deviceType!, count: r._count._all })),
      by_referrer: refRows.filter((r) => r.referrer).map((r) => ({ referrer: r.referrer!, count: r._count._all }))
    };
  });

  app.post('/api/reports', { preHandler: requireMarketer }, async (request, reply) => {
    const body = request.body as { client_id?: string | null; link_ids?: string[]; date_from?: string; date_to?: string };
    if (!body.date_from || !body.date_to) return reply.code(400).send(errorBody('VALIDATION_ERROR', 'date_from and date_to are required'));
    const report = await prisma.report.create({
      data: {
        status: 'pending',
        requestedBy: request.userAuth!.id,
        clientId: body.client_id ?? null,
        linkIds: body.link_ids ?? [],
        dateFrom: new Date(body.date_from),
        dateTo: new Date(body.date_to),
        kind: 'manual'
      }
    });
    const event: EventEnvelope<ReportRequestedPayload> = {
        event_id: randomUUID(),
      event_type: 'report.requested',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        report_id: report.id,
        requested_by: report.requestedBy,
        client_id: report.clientId,
        link_ids: report.linkIds,
        date_from: report.dateFrom.toISOString(),
        date_to: report.dateTo.toISOString(),
        kind: report.kind
      }
    };
    publishEvent('report.requested', event);
    return reply.code(202).send({ report_id: report.id, status: report.status });
  });

  app.get('/api/reports', { preHandler: requireMarketer }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const { page, limit, skip } = pageParams(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.client_id) where.clientId = query.client_id;
    const [data, total] = await Promise.all([
      prisma.report.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.report.count({ where })
    ]);
    return {
      data: data.map((report) => ({
        id: report.id,
        status: report.status,
        client_id: report.clientId,
        date_from: report.dateFrom.toISOString(),
        date_to: report.dateTo.toISOString(),
        download_url: report.status === 'done' ? `/api/reports/${report.id}/download` : null,
        error_message: report.errorMessage,
        created_at: report.createdAt.toISOString(),
        completed_at: report.completedAt?.toISOString() ?? null
      })),
      total,
      page
    };
  });

  app.get('/api/reports/:id', { preHandler: requireMarketer }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return reply.code(404).send(errorBody('REPORT_NOT_FOUND', 'Report not found'));
    return {
      id: report.id,
      status: report.status,
      download_url: report.status === 'done' ? `/api/reports/${report.id}/download` : null,
      error_message: report.errorMessage,
      created_at: report.createdAt.toISOString(),
      completed_at: report.completedAt?.toISOString() ?? null
    };
  });

  app.get('/api/reports/:id/download', { preHandler: requireMarketer }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report?.filePath || report.status !== 'done') return reply.code(404).send(errorBody('REPORT_NOT_FOUND', 'Report not found'));
    return reply.type('application/pdf').send(fs.createReadStream(report.filePath));
  });

  app.get('/:short_code', async (request, reply) => {
    const { short_code } = request.params as { short_code: string };
    const cacheKey = `redirect:${short_code}`;
    let cached: RedirectCache | null = null;
    try {
      const value = await redis.get(cacheKey);
      cached = value ? JSON.parse(value) : null;
    } catch (error) {
      request.log.warn({ error }, 'Redis read failed');
    }

    let redirect: RedirectCache | null = cached;
    if (!redirect) {
      const link = await prisma.link.findUnique({ where: { shortCode: short_code } });
      if (!link || !isActiveLink(link)) return reply.code(404).send(errorBody('LINK_NOT_FOUND', 'Link not found'));
      redirect = { link_id: link.id, original_url: link.originalUrl, expires_at: link.expiresAt?.toISOString() ?? null };
      await redis.set(cacheKey, JSON.stringify(redirect), 'EX', ttlSeconds(link.expiresAt)).catch((error) => request.log.warn({ error }, 'Redis write failed'));
    } else if (redirect.expires_at && new Date(redirect.expires_at).getTime() <= Date.now()) {
      return reply.code(404).send(errorBody('LINK_NOT_FOUND', 'Link not found'));
    }

    const event: EventEnvelope<ClickRecordedPayload> = {
      event_id: randomUUID(),
      event_type: 'click.recorded',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        link_id: redirect.link_id,
        short_code,
        clicked_at: new Date().toISOString(),
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] ?? '',
        referrer: request.headers.referer ?? null
      }
    };
    reply.header('Location', redirect.original_url).code(302).send();
    publishEvent('click.recorded', event);
  });

  app.addHook('onClose', async () => {
    await redis.quit();
    await closeRabbit();
    await prisma.$disconnect();
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildApp();
  await app.listen({ host: '0.0.0.0', port: env.PORT });
}
