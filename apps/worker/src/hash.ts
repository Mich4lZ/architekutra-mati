import { createHash } from 'node:crypto';

export function hashIp(ip: string, salt: string) {
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}
