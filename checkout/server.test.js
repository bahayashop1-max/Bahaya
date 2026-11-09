'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const Stripe = require('stripe');
const { createCheckout, loadConfig } = require('./server');

const config = loadConfig({
  STRIPE_API_KEY: 'sk_' + 'test_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'fixture',
  STRIPE_PRICE_ID: 'price_fixture'
});

test('live mode requires live credentials, HTTPS, a payment configuration and explicit storage', () => {
  const env = {
    CHECKOUT_MODE: 'live',
    CHECKOUT_ORIGIN: 'https://checkout.example.com',
    CHECKOUT_DATA_DIR: os.tmpdir(),
    STRIPE_API_KEY: 'rk_' + 'live_fixture',
    STRIPE_WEBHOOK_SECRET: config.webhookSecret,
    STRIPE_PRICE_ID: config.priceId,
    STRIPE_PAYMENT_METHOD_CONFIGURATION: 'pmc_fixture'
  };
  assert.equal(loadConfig(env).live, true);
  for (const [key, value] of Object.entries({
    CHECKOUT_ORIGIN: 'http://localhost:8090',
    CHECKOUT_DATA_DIR: '',
    STRIPE_API_KEY: config.apiKey,
    STRIPE_PAYMENT_METHOD_CONFIGURATION: ''
  })) {
    assert.throws(() => loadConfig({ ...env, [key]: value }));
  }
});

test('hosted Checkout uses the Stripe Price and records verified payments once', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'bahaya-checkout-'));
  const { webhooks } = new Stripe(config.apiKey);
  const calls = [];
  const id = 'cs_test_fixture';
  const stripe = {
    webhooks,
    prices: {
      retrieve: async () => ({
        id: config.priceId, active: true, livemode: false, type: 'one_time',
        currency: 'dkk', billing_scheme: 'per_unit', unit_amount: 3500,
        product: { active: true, name: 'Fixture' }
      })
    },
    checkout: {
      sessions: {
        async create(params, options) {
          calls.push({ params, options });
          return { url: 'https://checkout.stripe.com/c/pay/' + id, livemode: false };
        }
      }
    }
  };
  const server = await createCheckout({ ...config, dataDir, paymentConfig: 'pmc_fixture' }, stripe);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const attempt = randomUUID();
  const start = origin => fetch(base + '/api/session', {
    method: 'POST',
    headers: { origin, 'x-checkout-attempt': attempt },
    body: JSON.stringify({ amount: 1, price: 'price_untrusted' })
  });
  assert.equal((await start('https://other.example.com')).status, 403);
  assert.equal((await start(config.origin)).status, 200);
  assert.equal((await start(config.origin)).status, 200);
  assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
  const { params } = calls[0];
  assert.deepEqual(params.line_items, [{ price: config.priceId, quantity: 1 }]);
  assert.equal(params.payment_method_configuration, 'pmc_fixture');
  assert.equal(params.payment_method_types, undefined);
  assert.equal(params.success_url, config.origin + '/?session_id={CHECKOUT_SESSION_ID}');

  const session = {
    id, mode: 'payment', livemode: false, currency: 'dkk',
    amount_total: 3500, payment_intent: 'pi_fixture', metadata: params.metadata
  };
  const deliver = (type, fields, { live = false, signed = true } = {}) => {
    const payload = JSON.stringify({
      id: 'evt_' + randomUUID(), type: 'checkout.session.' + type, livemode: live,
      data: { object: { ...session, ...fields } }
    });
    const header = webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret });
    return fetch(base + '/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': signed ? header : 'invalid' }, body: payload
    });
  };
  const status = async () => {
    const response = await fetch(base + '/api/status?session_id=' + id);
    return (await response.json()).status;
  };
  assert.equal(await status(), 'pending');
  assert.equal((await deliver('completed', { payment_status: 'paid' }, { signed: false })).status, 400);
  assert.equal((await deliver('completed', { payment_status: 'paid' }, { live: true })).status, 200);
  assert.equal((await deliver('completed', { payment_status: 'paid', amount_total: 1 })).status, 400);
  assert.equal((await deliver('completed', { payment_status: 'unpaid' })).status, 200);
  assert.equal(await status(), 'pending');
  assert.equal((await deliver('async_payment_failed', { payment_status: 'unpaid' })).status, 200);
  assert.equal(await status(), 'failed');
  assert.equal((await deliver('async_payment_succeeded', { payment_status: 'paid' })).status, 200);
  assert.equal((await deliver('completed', { payment_status: 'paid' })).status, 200);
  assert.equal((await deliver('async_payment_failed', { payment_status: 'unpaid' })).status, 200);
  assert.equal(await status(), 'paid');
  const db = new DatabaseSync(path.join(dataDir, 'checkout-payments.sqlite'), { readOnly: true });
  try {
    assert.equal(db.prepare('SELECT count(*) AS count FROM payments').get().count, 1);
  } finally {
    db.close();
  }
});
