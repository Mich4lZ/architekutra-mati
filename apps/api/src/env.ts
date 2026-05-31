import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  RABBITMQ_URL: z.string(),
  JWT_SECRET: z.string(),
  APP_BASE_URL: z.string().default('http://localhost:3000')
});

export const env = schema.parse(process.env);
