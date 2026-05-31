import amqp, { type Channel, type Connection } from 'amqplib';
import { DEAD_QUEUE, EXCHANGE, type EventEnvelope } from '../../../packages/shared/src/events.js';
import { env } from './env.js';

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function getChannel() {
  if (channel) return channel;
  connection = (await amqp.connect(env.RABBITMQ_URL)) as any;
  channel = (await (connection as any).createChannel()) as Channel;
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
  return channel;
}

export function publishEvent<T>(routingKey: string, event: EventEnvelope<T>) {
  void getChannel()
    .then((ch) => {
      ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
        contentType: 'application/json',
        deliveryMode: 2
      });
    })
    .catch((error: unknown) => {
      console.error({ error, routingKey }, 'RabbitMQ publish failed');
    });
}

export async function closeRabbit() {
  if (channel) await channel.close();
  if (connection) await (connection as any).close();
}
