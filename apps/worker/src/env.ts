import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().default('postgresql://trackflow:trackflow@localhost:5432/trackflow'),
  RABBITMQ_URL: z.string().default('amqp://trackflow:trackflow@localhost:5672'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default('noreply@trackflow.io'),
  PDF_STORAGE_PATH: z.string().default('./storage/reports'),
  IP_HASH_SALT: z.string().default('dev-change-me-ip-salt'),
  APP_BASE_URL: z.string().default('http://localhost:3000')
});

export const env = schema.parse(process.env);
