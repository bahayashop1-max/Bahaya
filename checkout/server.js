'use strict';

const { createServer } = require('node:http');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Stripe = require('stripe');

const INTEGRATION = 'bahaya-shop-checkout-qmdwktvr';
const SESSION_ID = /^cs_(?:test|live)_[a-zA-Z0-9]+$/;
const ATTEMPT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const WEBHOOK_LIMIT = 256 * 1024;
const PAYMENT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed'
]);

function loadConfig(env) {
  const mode = env.CHECKOUT_MODE || 'test';
  const live = mode === 'live';
  if (!['test', 'live'].includes(mode)) throw new Error('Invalid CHECKOUT_MODE');
  const port = Number(env.PORT || 8090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const origin = env.CHECKOUT_ORIGIN || (live ? '' : 'http://localhost:' + port);
  const url = URL.canParse(origin) && new URL(origin);
  if (!url || origin !== url.origin || (live && url.protocol !== 'https:') ||
      (!live && !['http:', 'https:'].includes(url.protocol))) {
    throw new Error('Set CHECKOUT_ORIGIN to the checkout origin (HTTPS in live mode)');
  }
  const apiKey = env.STRIPE_API_KEY || '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
  const priceId = env.STRIPE_PRICE_ID || '';
  const paymentConfig = env.STRIPE_PAYMENT_METHOD_CONFIGURATION || '';
  if (!new RegExp('^[sr]k_' + mode + '_[a-zA-Z0-9]+$').test(apiKey) ||
      !/^whsec_[a-zA-Z0-9]+$/.test(webhookSecret) || !/^price_[a-zA-Z0-9]+$/.test(priceId) ||
      (live && !paymentConfig) || (paymentConfig && !/^pmc_[a-zA-Z0-9]+$/.test(paymentConfig))) {
    throw new Error('Set Stripe credentials, a Price and (for live mode) a payment method configuration');
  }
  const dataDir = env.CHECKOUT_DATA_DIR || (live ? '' : path.join(__dirname, 'data'));
  if (!path.isAbsolute(dataDir)) throw new Error('Set CHECKOUT_DATA_DIR to an absolute directory');
  return { live, port, origin, apiKey, webhookSecret, priceId, paymentConfig, dataDir };
}

function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readWebhook(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > WEBHOOK_LIMIT) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function createCheckout(config, stripe) {
  const price = await stripe.prices.retrieve(config.priceId, { expand: ['product'] });
  if (price.livemode !== config.live || !price.active || price.type !== 'one_time' ||
      price.currency !== 'dkk' || price.billing_scheme !== 'per_unit' ||
      price.custom_unit_amount || price.transform_quantity ||
      !Number.isSafeInteger(price.unit_amount) || price.unit_amount < 250 ||
      !price.product?.active || !price.product.name) {
    throw new Error('Configure an active fixed one-time DKK Price of at least 2.50 DKK');
  }

  const item = { name: price.product.name, amount: price.unit_amount, live: config.live };
  const page = readFileSync(path.join(__dirname, 'index.html'));
  const script = readFileSync(path.join(__dirname, 'checkout.js'));
  mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, 'checkout-payments.sqlite'));
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS payments (
      session_id TEXT PRIMARY KEY,
      price_id TEXT NOT NULL,
      amount_ore INTEGER NOT NULL,
      payment_intent TEXT,
      status TEXT NOT NULL CHECK(status IN ('paid', 'failed')),
      event_id TEXT NOT NULL
    ) STRICT;
  `);
  const statusFor = db.prepare('SELECT status FROM payments WHERE session_id = ?');
  const record = db.prepare(`
    INSERT INTO payments VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      status = excluded.status, payment_intent = excluded.payment_intent, event_id = excluded.event_id
    WHERE payments.status = 'failed' AND excluded.status = 'paid'
  `);

  async function webhook(req, res) {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') return reply(res, 400, { error: 'invalid_signature' });
    const raw = await readWebhook(req);
    if (!raw) return reply(res, 413, { error: 'payload_too_large' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, config.webhookSecret);
    } catch {
      return reply(res, 400, { error: 'invalid_signature' });
    }
    if (!PAYMENT_EVENTS.has(event.type) || event.livemode !== config.live) {
      return reply(res, 200, { received: true });
    }

    const session = event.data.object;
    const metadata = session.metadata;
    if (metadata?.integration !== INTEGRATION) return reply(res, 200, { received: true });
    const expectedAmount = Number(metadata.amount_ore);
    if (session.livemode !== config.live || session.mode !== 'payment' ||
        !SESSION_ID.test(session.id) || !/^price_[a-zA-Z0-9]+$/.test(metadata.price_id) ||
        session.currency !== 'dkk' || !Number.isSafeInteger(expectedAmount) ||
        expectedAmount < 250 || session.amount_total !== expectedAmount) {
      return reply(res, 400, { error: 'unexpected_session' });
    }
    const failed = event.type === 'checkout.session.async_payment_failed';
    const paid = !failed && session.payment_status === 'paid';
    if (paid || failed) {
      const intent = session.payment_intent;
      if (paid && (typeof intent !== 'string' || !intent.startsWith('pi_'))) {
        return reply(res, 400, { error: 'unexpected_payment_intent' });
      }
      record.run(session.id, metadata.price_id, expectedAmount, intent || null,
        paid ? 'paid' : 'failed', event.id);
    }
    return reply(res, 200, { received: true });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = req.method + ' ' + url.pathname;
    switch (route) {
      case 'GET /':
        return reply(res, 200, page, 'text/html; charset=utf-8');
      case 'GET /checkout.js':
        return reply(res, 200, script, 'text/javascript; charset=utf-8');
      case 'GET /api/item':
        return reply(res, 200, item);
      case 'GET /api/status': {
        const id = url.searchParams.get('session_id');
        if (!SESSION_ID.test(id || '')) return reply(res, 400, { error: 'invalid_session' });
        return reply(res, 200, { status: statusFor.get(id)?.status || 'pending' });
      }
      case 'POST /api/session': {
        const attempt = req.headers['x-checkout-attempt'];
        if (req.headers.origin !== config.origin) return reply(res, 403, { error: 'invalid_origin' });
        if (!ATTEMPT_ID.test(attempt || '')) return reply(res, 400, { error: 'invalid_attempt' });
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          adaptive_pricing: { enabled: false },
          line_items: [{ price: price.id, quantity: 1 }],
          payment_method_configuration: config.paymentConfig || undefined,
          integration_identifier: INTEGRATION,
          metadata: { integration: INTEGRATION, price_id: price.id, amount_ore: String(item.amount) },
          success_url: config.origin + '/?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: config.origin + '/?cancelled=1'
        }, { idempotencyKey: INTEGRATION + ':' + attempt });
        if (!session.url || session.livemode !== config.live) throw new Error('Invalid Checkout Session');
        return reply(res, 200, { url: session.url });
      }
      case 'POST /stripe/webhook':
        return webhook(req, res);
      default:
        return reply(res, 404, { error: 'not_found' });
    }
  }

  const server = createServer({ requestTimeout: 30_000 }, (req, res) => {
    handle(req, res).catch(() => {
      console.error('Checkout request failed');
      if (!res.headersSent && !res.destroyed) reply(res, 500, { error: 'checkout_error' });
    });
  });
  server.on('close', () => db.close());
  return server;
}

if (require.main === module) {
  async function start() {
    let config;
    try {
      config = loadConfig(process.env);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    const stripe = new Stripe(config.apiKey, { timeout: 10_000, maxNetworkRetries: 2 });
    const server = await createCheckout(config, stripe);
    server.listen(config.port, config.live ? '0.0.0.0' : 'localhost', () => {
      console.log('Bahaya Checkout: ' + config.origin + (config.live ? ' (LIVE)' : ' (TEST)'));
    });
  }
  start().catch(() => {
    console.error('Checkout startup failed. Check the Stripe Price, API access and data directory.');
    process.exitCode = 1;
  });
}

module.exports = { createCheckout, loadConfig };
