import { describe, expect, it, vi } from 'vitest';
import { handleNotification } from './notification.js';
import type { EventEnvelope, NotificationPayload } from '../../../packages/shared/src/events.js';

function event(): EventEnvelope<NotificationPayload> {
  return {
    event_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    event_type: 'notification.send',
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload: {
      type: 'report_ready',
      recipient_email: 'marketer@test.com',
      subject: 'Ready',
      template: 'report_ready',
      dedupe_key: 'report_ready:test',
      data: {
        report_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        link_id: null,
        download_url: 'http://localhost/report.pdf',
        campaign_name: null,
        short_code: null,
        date_from: null,
        date_to: null
      }
    }
  };
}

describe('handleNotification', () => {
  it('does not send a second mail for the same sent dedupe_key', async () => {
    const sendMail = vi.fn();
    const prisma = {
      notificationLog: {
        findUnique: vi.fn().mockResolvedValue({ sentAt: new Date() }),
        upsert: vi.fn()
      }
    } as any;

    const result = await handleNotification(prisma, event(), sendMail);
    expect(result.duplicate).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends and records a new notification', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const prisma = {
      notificationLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({})
      }
    } as any;

    await handleNotification(prisma, event(), sendMail);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(prisma.notificationLog.upsert).toHaveBeenCalledTimes(1);
  });
});
