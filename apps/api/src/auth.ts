import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../../packages/db/src/client.js';
import { errorBody } from '../../../packages/shared/src/http.js';

export type AuthUser = {
  id: string;
  email: string;
  role: 'marketer' | 'client';
  client_id: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    userAuth?: AuthUser;
  }
}

export async function registerAuth(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const user = await prisma.user.findUnique({ where: { email: body.email ?? '' } });
    if (!user || !(await bcrypt.compare(body.password ?? '', user.passwordHash))) {
      return reply.code(401).send(errorBody('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      client_id: user.clientId
    };
    return {
      token: app.jwt.sign(payload),
      user: payload
    };
  });
}

export async function requireAuth(request: FastifyRequest, reply: any) {
  try {
    request.userAuth = await request.jwtVerify<AuthUser>();
  } catch {
    return reply.code(401).send(errorBody('UNAUTHORIZED', 'Unauthorized'));
  }
}

export async function requireMarketer(request: FastifyRequest, reply: any) {
  await requireAuth(request, reply);
  if (!request.userAuth) return;
  if (request.userAuth.role !== 'marketer') {
    return reply.code(403).send(errorBody('FORBIDDEN', 'Forbidden'));
  }
}
