'use strict';
const mqtt = require('mqtt');
const os = require('node:os');
const { env } = require('./config');

/**
 * MQTT 브로커 연결. 끊기면 자동 재연결하고, 재연결 시 subscribe 를 다시 건다.
 * (clean: true 이므로 재연결마다 구독을 새로 등록해야 한다)
 */
function connectMqtt(serviceName, logger, { subscriptions = [], onMessage } = {}) {
  const url = env('MQTT_URL', 'mqtt://localhost:1883');
  const client = mqtt.connect(url, {
    clientId: `${serviceName}-${os.hostname()}-${process.pid}`.slice(0, 64),
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clean: true,
  });

  client.on('connect', () => {
    logger.info('mqtt connected', { url });
    if (subscriptions.length) {
      client.subscribe(subscriptions, { qos: 1 }, (err) => {
        if (err) logger.error('mqtt subscribe failed', { err });
        else logger.info('mqtt subscribed', { subscriptions });
      });
    }
  });
  client.on('reconnect', () => logger.warn('mqtt reconnecting'));
  client.on('error', (err) => logger.error('mqtt error', { err: err.message }));

  if (onMessage) {
    client.on('message', (topic, buf, packet) => {
      let payload = null;
      const text = buf.toString();
      if (text.length) {
        try { payload = JSON.parse(text); } catch {
          logger.warn('mqtt invalid json', { topic });
          return;
        }
      }
      Promise.resolve(onMessage(topic, payload, packet)).catch((err) =>
        logger.error('mqtt handler error', { err, topic }));
    });
  }

  const publish = (topic, message, opts = {}) =>
    new Promise((resolve, reject) => {
      const body = message === null ? '' : JSON.stringify(message);
      client.publish(topic, body, { qos: 1, ...opts }, (err) => (err ? reject(err) : resolve()));
    });

  return { client, publish, isConnected: () => client.connected };
}

module.exports = { connectMqtt };
