import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

function ipHash(ip: string) {
  return createHash('sha256').update(`${ip}:dev-change-me-ip-salt`).digest('hex');
}

async function main() {
  const passwordHash = await bcrypt.hash('test123', 10);

  const client = await prisma.client.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: {},
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Acme Agency Client',
      contactEmail: 'client@test.com'
    }
  });

  const marketer = await prisma.user.upsert({
    where: { email: 'marketer@test.com' },
    update: { passwordHash },
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'marketer@test.com',
      passwordHash,
      role: 'marketer'
    }
  });

  await prisma.user.upsert({
    where: { email: 'client@test.com' },
    update: { passwordHash, clientId: client.id },
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'client@test.com',
      passwordHash,
      role: 'client',
      clientId: client.id
    }
  });

  const codes = ['xK9mP1', 'aB2cD3', 'Z9yX8w', 'M4nO5p', 'Q7rS8t'];
  for (const [index, shortCode] of codes.entries()) {
    await prisma.link.upsert({
      where: { shortCode },
      update: {},
      create: {
        shortCode,
        originalUrl: `https://example.com/campaign-${index + 1}`,
        campaignName: `Campaign ${index + 1}`,
        clientId: client.id,
        createdBy: marketer.id,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      }
    });
  }

  const primary = await prisma.link.findUniqueOrThrow({ where: { shortCode: 'xK9mP1' } });
  const count = await prisma.click.count({ where: { linkId: primary.id } });
  if (count < 100) {
    await prisma.click.deleteMany({ where: { linkId: primary.id } });
    const now = Date.now();
    await prisma.click.createMany({
      data: Array.from({ length: 100 }, (_, i) => {
        const ip = `192.168.1.${i % 50}`;
        return {
          linkId: primary.id,
          eventId: randomUUID(),
          clickedAt: new Date(now - (i % 7) * 24 * 60 * 60 * 1000 - i * 60000),
          country: i % 3 === 0 ? 'PL' : 'US',
          city: i % 3 === 0 ? 'Warsaw' : 'New York',
          deviceType: i % 2 === 0 ? 'mobile' : 'desktop',
          browser: i % 2 === 0 ? 'Mobile Safari' : 'Chrome',
          os: i % 2 === 0 ? 'iOS' : 'Windows',
          referrer: i % 2 === 0 ? 'instagram.com' : 'newsletter',
          ipHash: ipHash(ip)
        };
      })
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
