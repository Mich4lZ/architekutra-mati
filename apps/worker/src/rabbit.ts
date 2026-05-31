import amqp, { type Channel, type Connection, type ConsumeMessage } from 'amqplib';
import { prisma } from '../../../packages/db/src/client.js';
import { DEAD_QUEUE, EXCHANGE, type ClickRecordedPayload, type EventEnvelope, type NotificationPayload, type ReportRequestedPayload } from '../../../packages/shared/src/events.js';
import { handleClickRecorded } from './click-consumer.js';
import { env } from './env.js';
import { handleNotification } from './notification.js';
import { handleReportRequested } from './report.js';

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function getChannel() {
  if (channel) return channel;
  connection = await amqp.connect(env.RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(DEAD_QUEUE, { durable: true });
  for (const [queue, routingKey] of [
    ['trackflow.clicks', 'click.recorded'],
    ['trackflow.reports', 'report.requested'],
    ['trackflow.notifications', 'notification.send']
  ] as const) {
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, EXCHANGE, routingKey);
  }
  await channel.prefetch(20);
  return channel;
}

export function publishEvent<T>(routingKey: string, event: EventEnvelope<T>) {
  void getChannel().then((ch) => {
    ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
      contentType: 'application/json',
      deliveryMode: 2
    });
  });
}

function retryOrDead(ch: Channel, message: ConsumeMessage, error: unknown) {
  const retries = Number(message.properties.headers?.['x-retry-count'] ?? 0);
  if (retries >= 3) {
    ch.sendToQueue(DEAD_QUEUE, message.content, {
      deliveryMode: 2,
      headers: { ...message.properties.headers, error: String(error) }
    });
  } else {
    ch.publish(EXCHANGE, message.fields.routingKey, message.content, {
      deliveryMode: 2,
      headers: { ...message.properties.headers, 'x-retry-count': retries + 1 }
    });
  }
  ch.ack(message);
}

async function consumeJson<T>(queue: string, handler: (event: EventEnvelope<T>) => Promise<unknown>) {
  const ch = await getChannel();
  await ch.consume(queue, (message) => {
    if (!message) return;
    void Promise.resolve()
      .then(() => handler(JSON.parse(message.content.toString())))
      .then(() => ch.ack(message))
      .catch((error) => retryOrDead(ch, message, error));
  });
}

export async function startConsumers() {
  await consumeJson<ClickRecordedPayload>('trackflow.clicks', (event) => handleClickRecorded(prisma, event, env.IP_HASH_SALT));
  await consumeJson<ReportRequestedPayload>('trackflow.reports', (event) => handleReportRequested(prisma, event));
  await consumeJson<NotificationPayload>('trackflow.notifications', (event) => handleNotification(prisma, event));
}

export async function closeRabbit() {
  await channel?.close();
  await connection?.close();
}
