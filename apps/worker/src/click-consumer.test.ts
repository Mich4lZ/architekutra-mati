import { describe, expect, it, vi } from 'vitest';
import { handleClickRecorded } from './click-consumer.js';
import type { EventEnvelope, ClickRecordedPayload } from '../../../packages/shared/src/events.js';

function event(id: string): EventEnvelope<ClickRecordedPayload> {
  return {
    event_id: id,
    event_type: 'click.recorded',
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload: {
      link_id: '11111111-1111-1111-1111-111111111111',
      short_code: 'xK9mP1',
      clicked_at: new Date().toISOString(),
      ip_address: '8.8.8.8',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      referrer: null
    }
  };
}

describe('handleClickRecorded', () => {
  it('ignores a second event with the same event_id', async () => {
    const prisma = {
      click: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing' }),
        create: vi.fn()
      }
    } as any;

    const result = await handleClickRecorded(prisma, event('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'salt');
    expect(result.duplicate).toBe(true);
    expect(prisma.click.create).not.toHaveBeenCalled();
  });

  it('creates a click for a new event', async () => {
    const prisma = {
      click: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      }
    } as any;

    await handleClickRecorded(prisma, event('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'salt');
    expect(prisma.click.create).toHaveBeenCalledTimes(1);
    expect(prisma.click.create.mock.calls[0][0].data.ipHash).toHaveLength(64);
  });
});
